FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY --chown=1000:1000 server.py .

ENV PORT=8080
EXPOSE 8080

USER 1000:1000

CMD ["python", "server.py"]
