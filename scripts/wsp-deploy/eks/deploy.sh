#!/usr/bin/env bash

cd ../../..

helm upgrade --namespace magda --install --timeout 9999s magda deploy/helm/wsp-magda -f deploy/helm/wsp-deploy-test.yml

cd -
