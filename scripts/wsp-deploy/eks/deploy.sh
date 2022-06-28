#!/usr/bin/env bash

IMAGE_TAG=${1:latest}

cd ../../..

helm upgrade --namespace magda --install --timeout 9999s magda deploy/helm/wsp-magda -f deploy/helm/wsp-deploy-test.yml --set "magda.magda-core.web-server.image.tag=${IMAGE_TAG}"

cd -
