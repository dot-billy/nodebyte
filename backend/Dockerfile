FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
  && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /app/requirements.txt
RUN pip install -U pip && pip install -r /app/requirements.txt

COPY . /app

EXPOSE 8000

RUN chmod +x /app/entrypoint.sh

CMD ["sh", "/app/entrypoint.sh"]

