FROM python:3.8-slim-bullseye

ENV AWS_DEFAULT_REGION=ap-southeast-2

# Install the toolset.
RUN apt -y update && apt -y install curl git \
    && curl https://raw.githubusercontent.com/helm/helm/master/scripts/get-helm-3 | bash

COPY eks/deploy.sh /usr/local/bin/deploy.sh

RUN chmod +x /usr/local/bin/deploy.sh && \
    chown 555 /usr/local/bin/deploy.sh

CMD deploy.sh
