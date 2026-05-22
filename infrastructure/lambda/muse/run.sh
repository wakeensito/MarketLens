#!/bin/sh
# AWS Lambda Web Adapter entrypoint for the Muse streaming Lambda.
# LWA proxies the Function URL's RESPONSE_STREAM HTTP onto $AWS_LWA_PORT,
# where this uvicorn process serves the Starlette ASGI app.
exec python -m uvicorn stream:app --host 0.0.0.0 --port "${AWS_LWA_PORT:-8080}" --no-access-log --loop asyncio
