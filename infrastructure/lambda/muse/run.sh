#!/bin/sh
# AWS Lambda Web Adapter entrypoint for the Muse streaming Lambda.
# LWA proxies the Function URL's RESPONSE_STREAM HTTP onto $AWS_LWA_PORT,
# where this uvicorn process serves the Starlette ASGI app.
#
# We launch our own `python`, which bypasses the managed runtime's bootstrap —
# so the Lambda layer directory (/opt/python) is NOT on sys.path by default.
# Both aws_lambda_powertools (Powertools layer) and plinths_auth
# (PlinthsAuthLayer) live there, so without this export, `import` fails at
# startup and uvicorn exits 1. App code (stream.py) + starlette/uvicorn/
# sse-starlette are bundled in /var/task, which `python -m` already covers.
export PYTHONPATH="/opt/python:/opt/python/lib/python3.13/site-packages${PYTHONPATH:+:$PYTHONPATH}"
exec python -m uvicorn stream:app --host 0.0.0.0 --port "${AWS_LWA_PORT:-8080}" --no-access-log --loop asyncio
