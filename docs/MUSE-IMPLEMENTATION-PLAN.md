# Muse (Chat Agent) — Implementation Plan

> **Goal:** Add interactive chat to Plinths reports. Users ask follow-up questions about their market analysis, and Muse responds with context-aware answers using the report data.

**Status:** Planning phase  
**Target:** Post-billing, pre-Phase 5  
**Effort estimate:** 2-3 weeks  
**ML Associate relevance:** High — model selection, inference optimization, cost analysis, SageMaker vs Bedrock comparison

---

## 1. What Is Muse?

Muse is a conversational AI agent that lives inside each report. It has full context of the market analysis and can answer questions like:

- "Who are the top 3 competitors and what are their weaknesses?"
- "What's the best entry strategy for this market?"
- "How does this compare to the SaaS market?"
- "What would a $50K MVP look like?"

**Key features:**
- Report-scoped conversation (each report has its own chat history)
- Streaming responses (SSE — tokens appear as they're generated)
- Plan-based limits (Pro: 30 messages/report, Max: unlimited)
- Context injection (report `result_json` in system prompt)

---

## 2. Architecture Options

### Option A: Bedrock (Recommended for MVP)

```
Frontend (SSE client)
  ↓ POST /api/reports/{report_id}/chat
API Lambda
  ↓ invoke with RequestResponse
Chat Lambda (streaming enabled)
  ↓ bedrock-runtime:InvokeModelWithResponseStream
Amazon Bedrock (Amazon Nova 2 Lite default; Claude / DeepSeek / Sonnet optional on Max)
  ↓ SSE stream
Chat Lambda
  ↓ SSE stream
API Gateway
  ↓ SSE stream
Frontend (displays tokens in real-time)
```

**Pros:**
- ✅ No infrastructure (serverless)
- ✅ Fast to implement (1 Lambda + DynamoDB)
- ✅ Multiple models available (Claude, Nova, DeepSeek)
- ✅ Streaming built-in (`InvokeModelWithResponseStream`)

**Cons:**
- ❌ Higher per-token cost than SageMaker
- ❌ Less control over model behavior

### Option B: SageMaker Endpoint

```
Frontend (SSE client)
  ↓ POST /api/reports/{report_id}/chat
API Lambda
  ↓ invoke with RequestResponse
Chat Lambda (streaming enabled)
  ↓ sagemaker-runtime:InvokeEndpointWithResponseStream
SageMaker Real-Time Endpoint (Llama 3.1 8B or Mistral 7B)
  ↓ SSE stream
Chat Lambda
  ↓ SSE stream
Frontend
```

**Pros:**
- ✅ Lower per-token cost (pay for instance hours, not tokens)
- ✅ Full control (custom model, fine-tuning, quantization)
- ✅ ML Associate exam relevance (SageMaker deployment, endpoints, inference)

**Cons:**
- ❌ Always-on cost (instance runs 24/7 even with no traffic)
- ❌ Cold start (endpoint takes 2-5 min to spin up)
- ❌ More complex (model deployment, endpoint config, autoscaling)

### Option C: Bedrock Agents (Future)

Amazon Bedrock Agents with function calling (can query DynamoDB, call APIs, etc.). Deferred until Bedrock Agents support streaming responses.

---

## 3. Cost Comparison: Bedrock vs SageMaker

### Bedrock (Amazon Nova 2 Lite)

| Metric | Value |
|---|---|
| Input tokens | $0.25 / 1M tokens |
| Output tokens | $1.25 / 1M tokens |
| Avg conversation | 10 messages × 500 tokens/msg = 5K tokens |
| Cost per conversation | ~$0.006 |
| Monthly cost (100 users, 5 convos/user) | ~$3 |

**Break-even:** Always cheaper than SageMaker until you hit ~50K conversations/month.

### SageMaker (Llama 3.1 8B on ml.g5.xlarge)

| Metric | Value |
|---|---|
| Instance cost | $1.006/hour = $24.14/day = $724/month |
| Tokens per second | ~50 tokens/sec (8B model) |
| Cost per token | $0 (already paying for instance) |
| Monthly cost (100 users, 5 convos/user) | $724 (fixed) |

**Break-even:** Cheaper than Bedrock at ~120K conversations/month.

### Recommendation

**Start with Bedrock** (Option A):
- $3/month at 500 conversations
- $30/month at 5K conversations
- $300/month at 50K conversations

**Switch to SageMaker** when you hit 50K+ conversations/month (at that scale, $724/month fixed is cheaper than $300+ variable).

---

## 4. Implementation Plan (Bedrock MVP)

### Phase 1: Backend (Chat Lambda + DynamoDB)

**Step 1.1: DynamoDB Schema**

Add conversation history table:

```python
# Table: marketlens-conversations-dev
{
  "pk": "REPORT#{report_id}",
  "sk": "MSG#{timestamp}#{message_id}",
  "role": "user" | "assistant",
  "content": "message text",
  "tokens_input": 123,
  "tokens_output": 456,
  "model_id": "amazon.nova-2-lite-v1:0",
  "created_at": "2026-05-10T12:34:56Z",
  "ttl": 1234567890  # 30 days for free, no TTL for paid
}
```

**Step 1.2: Chat Lambda**

Create `infrastructure/lambda/chat/app.py`:

```python
import json
import boto3
import os
from datetime import datetime, timedelta
from aws_lambda_powertools import Logger

logger = Logger()
bedrock = boto3.client("bedrock-runtime")
dynamodb = boto3.resource("dynamodb")
conversations_table = dynamodb.Table(os.environ["CONVERSATIONS_TABLE"])
reports_table = dynamodb.Table(os.environ["REPORTS_TABLE"])

def handler(event, context):
    """
    Chat handler (buffered).

    Input: { report_id, message, org_id, user_id, plan }
    Output: JSON response with full assistant message.

    NOTE: this example buffers the full response and returns JSON. Token-by-token
    streaming requires a different transport (Lambda response streaming via Function
    URL with InvokeMode=RESPONSE_STREAM, or ASGI app behind Lambda Web Adapter).
    That choice is still TBD — see CLAUDE.md > Muse > "Still TBD". A standard sync
    Python Lambda handler cannot stream; mixing `yield` with `return` would make
    this function a generator and break invocation.
    """
    report_id = event["report_id"]
    user_message = event["message"]
    org_id = event["org_id"]
    plan = event["plan"]

    message_count = _get_message_count(report_id)
    limit = _get_message_limit(plan)
    if message_count >= limit:
        return {"statusCode": 429, "body": json.dumps({"error": "Message limit reached"})}

    report = _get_report(org_id, report_id)
    if not report:
        return {"statusCode": 404, "body": json.dumps({"error": "Report not found"})}

    history = _get_conversation_history(report_id, limit=10)
    system_prompt = _build_system_prompt(report)
    messages = _build_messages(history, user_message)

    response = bedrock.invoke_model_with_response_stream(
        modelId=os.environ["CHAT_MODEL_ID"],
        contentType="application/json",
        accept="application/json",
        body=json.dumps({
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 2048,
            "temperature": 0.7,
            "system": system_prompt,
            "messages": messages,
        })
    )

    assistant_message = ""
    for chunk in response["body"]:
        chunk_data = json.loads(chunk["chunk"]["bytes"])
        if chunk_data["type"] == "content_block_delta":
            assistant_message += chunk_data["delta"]["text"]

    _save_message(report_id, "user", user_message, plan)
    _save_message(report_id, "assistant", assistant_message, plan)

    return {"statusCode": 200, "body": json.dumps({"message": assistant_message})}

def _build_system_prompt(report: dict) -> str:
    """Inject report context into system prompt."""
    result = report.get("result_json", {})
    return f"""You are Muse, an AI research assistant for Plinths market intelligence reports.

You have full context of this market analysis:

**Business Model:** {result.get('business_model')}
**Industry:** {result.get('industry')} / {result.get('sub_industry')}
**Geography:** {result.get('geography')}
**Saturation Score:** {result.get('saturation_score')}/100
**Opportunity Score:** {result.get('opportunity_score')}/100
**Difficulty:** {result.get('difficulty_label')} ({result.get('difficulty_score')}/100)

**Competitors:** {len(result.get('competitors', []))} identified
{_format_competitors(result.get('competitors', [])[:5])}

**Market Gaps:**
{_format_gaps(result.get('gaps', []))}

**Key Stats:**
{result.get('key_stats', 'N/A')}

**Market Size:** {result.get('market_size', 'Unknown')}

Answer the user's questions about this market analysis. Be concise, actionable, and reference specific data from the report."""

def _get_message_limit(plan: str) -> int:
    limits = {"free": 0, "pro": 30, "max": 9999, "admin": 9999}
    return limits.get(plan, 0)

def _save_message(report_id: str, role: str, content: str, plan: str):
    now = datetime.utcnow()
    ttl = None if plan in ["max", "admin"] else int((now + timedelta(days=30)).timestamp())
    
    conversations_table.put_item(Item={
        "pk": f"REPORT#{report_id}",
        "sk": f"MSG#{now.isoformat()}#{os.urandom(4).hex()}",
        "role": role,
        "content": content,
        "created_at": now.isoformat(),
        "ttl": ttl,
    })
```

**Step 1.3: Add to SAM Template**

```yaml
ConversationsTable:
  Type: AWS::DynamoDB::Table
  Properties:
    TableName: !Sub marketlens-conversations-${Stage}
    BillingMode: PAY_PER_REQUEST
    TimeToLiveSpecification:
      AttributeName: ttl
      Enabled: true
    AttributeDefinitions:
      - AttributeName: pk
        AttributeType: S
      - AttributeName: sk
        AttributeType: S
    KeySchema:
      - AttributeName: pk
        KeyType: HASH
      - AttributeName: sk
        KeyType: RANGE

ChatFunction:
  Type: AWS::Serverless::Function
  Properties:
    Handler: app.handler
    CodeUri: infrastructure/lambda/chat/
    Timeout: 60
    Environment:
      Variables:
        CONVERSATIONS_TABLE: !Ref ConversationsTable
        CHAT_MODEL_ID: amazon.nova-2-lite-v1:0
    Policies:
      - DynamoDBCrudPolicy:
          TableName: !Ref ConversationsTable
      - DynamoDBReadPolicy:
          TableName: !Ref ReportsTable
      - Statement:
          - Effect: Allow
            Action: bedrock:InvokeModelWithResponseStream
            Resource: !Sub "arn:aws:bedrock:${AWS::Region}::foundation-model/amazon.nova-2-lite-v1:0"
    Events:
      ChatApi:
        Type: Api
        Properties:
          Path: /api/reports/{report_id}/chat
          Method: POST
          RestApiId: !Ref ApiGatewayApi
```

---

### Phase 2: Frontend (SSE Client)

**Step 2.1: Chat Hook**

Create `frontend/src/hooks/useChat.ts`:

```typescript
import { useState, useCallback } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export function useChat(reportId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);

  const sendMessage = useCallback(async (content: string) => {
    // Add user message
    const userMessage: Message = {
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMessage]);
    setIsStreaming(true);

    // Start SSE stream
    const response = await fetch(`/api/reports/${reportId}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ message: content }),
    });

    if (!response.ok) {
      setIsStreaming(false);
      throw new Error('Chat request failed');
    }

    // Read SSE stream
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let assistantContent = '';

    const assistantMessage: Message = {
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, assistantMessage]);

    while (true) {
      const { done, value } = await reader!.read();
      if (done) break;

      const chunk = decoder.decode(value);
      assistantContent += chunk;

      // Update assistant message in real-time
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1].content = assistantContent;
        return updated;
      });
    }

    setIsStreaming(false);
  }, [reportId]);

  return { messages, sendMessage, isStreaming };
}
```

**Step 2.2: Chat Component**

Create `frontend/src/components/ChatPanel.tsx`:

```typescript
import { useState } from 'react';
import { useChat } from '../hooks/useChat';

export function ChatPanel({ reportId }: { reportId: string }) {
  const { messages, sendMessage, isStreaming } = useChat(reportId);
  const [input, setInput] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;

    await sendMessage(input);
    setInput('');
  };

  return (
    <div className="chat-panel">
      <div className="messages">
        {messages.map((msg, i) => (
          <div key={i} className={`message ${msg.role}`}>
            <div className="avatar">{msg.role === 'user' ? '👤' : '🤖'}</div>
            <div className="content">{msg.content}</div>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Ask about this market..."
          disabled={isStreaming}
        />
        <button type="submit" disabled={isStreaming || !input.trim()}>
          {isStreaming ? 'Thinking...' : 'Send'}
        </button>
      </form>
    </div>
  );
}
```

---

### Phase 3: Plan Gates

**Step 3.1: Message Limit Enforcement**

In Chat Lambda, check message count before processing:

```python
def _get_message_count(report_id: str) -> int:
    """Count messages in this conversation."""
    response = conversations_table.query(
        KeyConditionExpression="pk = :pk",
        ExpressionAttributeValues={":pk": f"REPORT#{report_id}"},
        Select="COUNT",
    )
    return response["Count"]
```

**Step 3.2: Frontend Gate**

Show upgrade prompt when limit is reached:

```typescript
if (messageCount >= limit) {
  return (
    <div className="chat-locked">
      <p>You've reached your message limit ({limit} messages/report).</p>
      <button onClick={() => navigate('/pricing')}>
        Upgrade to Max for unlimited chat
      </button>
    </div>
  );
}
```

---

## 5. Model Selection for Chat

### Cost-Optimized Options (Bedrock)

| Model | Input $/1M | Output $/1M | Speed | Quality | Best For |
|---|---|---|---|---|---|
| **Amazon Nova 2 Lite** | sync AWS | sync AWS | Fast | Strong | Pro tier default (aligned with report pipeline) |
| **Amazon Nova Lite** | $0.06 | $0.24 | Fast | Good | Legacy reference only |
| **Claude 3 Haiku** | $0.25 | $1.25 | Fast | Excellent | Optional / legacy |
| **DeepSeek V3** | $0.62 | $1.85 | Medium | Excellent | Max tier (reasoning-heavy) |
| **Claude 3.5 Sonnet** | $3.00 | $15.00 | Slow | Best | Enterprise (overkill for chat) |

**Recommendation:**
- **Free tier:** No chat (locked paywall)
- **Pro tier:** Amazon Nova 2 Lite (default; sync pricing on AWS)
- **Max tier:** User choice (Nova 2 Lite, DeepSeek, or Sonnet, plus non-Bedrock providers per `CLAUDE.md`)

### SageMaker Options (For Learning)

| Model | Instance | Cost/hour | Tokens/sec | Cost/1M tokens (equiv) |
|---|---|---|---|---|
| **Llama 3.1 8B** | ml.g5.xlarge | $1.006 | ~50 | $0 (fixed cost) |
| **Mistral 7B** | ml.g5.xlarge | $1.006 | ~60 | $0 (fixed cost) |
| **Llama 3.1 70B** | ml.g5.12xlarge | $7.09 | ~20 | $0 (fixed cost) |

**Break-even calculation:**
- Bedrock (Nova 2 Lite baseline): re-run cost model × 120K conversations after pricing sync
- SageMaker (8B): $724/month (fixed)

**When to use SageMaker:**
- You hit 50K+ conversations/month
- You want to fine-tune the model on your data
- You need custom behavior (RAG, function calling)

---

## 6. SageMaker Deep Dive (ML Associate Study)

### 6.1 Deploy Llama 3.1 8B on SageMaker

**Step 1: Create Model**

```python
import boto3
import sagemaker
from sagemaker.huggingface import HuggingFaceModel

role = "arn:aws:iam::ACCOUNT:role/SageMakerExecutionRole"

# Llama 3.1 8B from Hugging Face
huggingface_model = HuggingFaceModel(
    model_data="s3://sagemaker-models/llama-3.1-8b/",
    role=role,
    transformers_version="4.37",
    pytorch_version="2.1",
    py_version="py310",
    env={
        "HF_MODEL_ID": "meta-llama/Meta-Llama-3.1-8B-Instruct",
        "HF_TASK": "text-generation",
        "MAX_INPUT_LENGTH": "4096",
        "MAX_TOTAL_TOKENS": "8192",
    }
)

# Deploy to endpoint
predictor = huggingface_model.deploy(
    initial_instance_count=1,
    instance_type="ml.g5.xlarge",
    endpoint_name="plinths-chat-llama-8b",
)
```

**Step 2: Invoke Endpoint**

```python
import json

response = sagemaker_runtime.invoke_endpoint_with_response_stream(
    EndpointName="plinths-chat-llama-8b",
    ContentType="application/json",
    Body=json.dumps({
        "inputs": "What are the top competitors in the SaaS market?",
        "parameters": {
            "max_new_tokens": 512,
            "temperature": 0.7,
            "top_p": 0.9,
        }
    })
)

# Stream tokens
for event in response["Body"]:
    token = json.loads(event["PayloadPart"]["Bytes"])["token"]["text"]
    print(token, end="", flush=True)
```

**Step 3: Autoscaling**

```python
# Scale up when invocations > 100/min
autoscaling = boto3.client("application-autoscaling")

autoscaling.register_scalable_target(
    ServiceNamespace="sagemaker",
    ResourceId=f"endpoint/plinths-chat-llama-8b/variant/AllTraffic",
    ScalableDimension="sagemaker:variant:DesiredInstanceCount",
    MinCapacity=1,
    MaxCapacity=5,
)

autoscaling.put_scaling_policy(
    PolicyName="scale-on-invocations",
    ServiceNamespace="sagemaker",
    ResourceId=f"endpoint/plinths-chat-llama-8b/variant/AllTraffic",
    ScalableDimension="sagemaker:variant:DesiredInstanceCount",
    PolicyType="TargetTrackingScaling",
    TargetTrackingScalingPolicyConfiguration={
        "TargetValue": 100.0,
        "PredefinedMetricSpecification": {
            "PredefinedMetricType": "SageMakerVariantInvocationsPerInstance"
        },
        "ScaleInCooldown": 300,
        "ScaleOutCooldown": 60,
    }
)
```

### 6.2 Cost Optimization Techniques

**1. Spot Instances** (not available for real-time endpoints)

**2. Multi-Model Endpoints** (share 1 instance across multiple models)

```python
# Deploy multiple models to same endpoint
mme = sagemaker.multidatamodel.MultiDataModel(
    name="plinths-chat-mme",
    model_data_prefix="s3://models/",
    role=role,
)

mme.deploy(
    initial_instance_count=1,
    instance_type="ml.g5.xlarge",
)

# Invoke specific model
response = predictor.predict(
    data={"inputs": "..."},
    target_model="llama-8b.tar.gz",
)
```

**3. Serverless Inference** (pay per request, no always-on cost)

```python
from sagemaker.serverless import ServerlessInferenceConfig

serverless_config = ServerlessInferenceConfig(
    memory_size_in_mb=6144,
    max_concurrency=10,
)

predictor = model.deploy(
    serverless_inference_config=serverless_config,
)
```

**Cost:** $0.20/hour of compute + $0.000012/request  
**Break-even:** Cheaper than real-time endpoint if <5 requests/min

---

## 7. ML Associate Exam Concepts

| Concept | Where It Appears in Muse |
|---|---|
| **Model selection** | Choosing Nova 2 Lite vs Sonnet vs DeepSeek based on cost/quality |
| **Inference optimization** | Streaming responses, token limits, caching |
| **SageMaker endpoints** | Real-time vs serverless vs batch |
| **Autoscaling** | Target tracking on invocations per instance |
| **Multi-model endpoints** | Sharing 1 instance across Llama 8B + Mistral 7B |
| **Cost analysis** | Bedrock pay-per-token vs SageMaker pay-per-hour |
| **Streaming inference** | `InvokeModelWithResponseStream`, SSE transport |
| **Context window management** | Truncating conversation history to fit 4K tokens |
| **Prompt engineering** | System prompt with report context injection |
| **Model monitoring** | CloudWatch metrics (latency, token count, errors) |

---

## 8. Implementation Timeline

### Week 1: Backend MVP
- [ ] Day 1-2: DynamoDB schema + Chat Lambda (no streaming)
- [ ] Day 3-4: Bedrock streaming integration
- [ ] Day 5: Message limits + plan gates

### Week 2: Frontend + Polish
- [ ] Day 1-2: Chat UI component + SSE client
- [ ] Day 3: Upgrade prompts + locked state
- [ ] Day 4-5: Testing + bug fixes

### Week 3: SageMaker Experiment (Optional)
- [ ] Day 1-2: Deploy Llama 3.1 8B to SageMaker
- [ ] Day 3: Cost comparison (real usage data)
- [ ] Day 4-5: Document findings for ML Associate study

---

## 9. Success Metrics

| Metric | Target |
|---|---|
| Avg messages per conversation | >5 (indicates engagement) |
| Response latency (p95) | <3 seconds |
| Cost per conversation | Re-benchmark with Nova 2 Lite on Bedrock |
| Upgrade conversion (free → Pro) | >10% (chat is a key driver) |
| User satisfaction (thumbs up) | >80% |

---

## 10. Next Steps

1. **Review this plan** — any questions or changes?
2. **Choose starting point:**
   - **Option A:** Build Bedrock MVP first (fastest path to users)
   - **Option B:** SageMaker experiment first (learning-focused)
3. **Create feature branch:** `feature/muse-chat`
4. **Start with DynamoDB schema** (lowest risk, foundational)

---

*Created: May 2026 · For Plinths Muse (Chat Agent) feature*
