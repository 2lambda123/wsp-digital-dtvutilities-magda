#!/usr/bin/env bash

# creates secret which will apply the app and installation id to a kube secret
kubectl create secret generic controller-manager \
-n actions-runner-system \
--from-literal=github_app_id=218756 \
--from-literal=github_app_installation_id=27277385 \
--from-literal=github_token=AI3YOIZFPRV64REQ535RSBLCZOWH2 \
--from-file=github_app_private_key=wsp-dtv-magda-test.2022-07-10.private-key.pem

helm upgrade --install --namespace actions-runner-system --create-namespace \
             --wait actions-runner-controller actions-runner-controller/actions-runner-controller \
             --version 0.20.1 \
             --set syncPeriod=3m


helm install runner \
actions-runner-controller/actions-runner-controller \
--namespace actions-runner-system \
--version 0.20.1 \
--set syncPeriod=3m