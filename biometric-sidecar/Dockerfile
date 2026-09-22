FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
RUN pip uninstall -y opencv-contrib-python \
    && pip install --no-cache-dir --force-reinstall --no-deps opencv-contrib-python-headless==4.11.0.86

COPY app.py ./
RUN mkdir -p /var/lib/dentisys-biometric \
    && useradd --create-home --uid 10001 --shell /usr/sbin/nologin dentisys
RUN chown -R dentisys:dentisys /app /var/lib/dentisys-biometric
USER dentisys

EXPOSE 8000
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "--workers", "1", "--threads", "4", "--timeout", "60", "app:app"]
