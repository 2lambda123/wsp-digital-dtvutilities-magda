#!/usr/bin/env bash

IMAGE_TAG=${1:latest}

TMPFILE=$(mktemp)

echo ${KUBECONFIG} | base64 -d > ${TMPFILE}
export KUBECONFIG="${TMPFILE}"
chmod 600 ${TMPFILE}

helm dependency update deploy/helm/wsp-magda
helm upgrade --namespace magda --install --timeout 9999s magda deploy/helm/wsp-magda -f deploy/helm/wsp-deploy-test.yml --set "magda.magda-core.web-server.image.tag=${IMAGE_TAG}"

rm -f "${TMPFILE}"
