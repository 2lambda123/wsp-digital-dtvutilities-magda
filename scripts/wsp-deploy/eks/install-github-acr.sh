#!/bin/bash
# WIP - Script does not run end to end. copy and paste sections

# install cert-manager which is a pre-requisite
helm install \
cert-manager jetstack/cert-manager \
--namespace cert-manager \
--create-namespace \
--version v1.8.2 \
--set installCRDs=true

# create namespace
kubectl create namespace actions-runner-system

# creates secret which will apply the app and installation id to a kube secret
kubectl create secret generic controller-manager \
-n actions-runner-system \
--from-literal=github_app_id=218756 \
--from-literal=github_app_installation_id=27277385 \
--from-file=github_app_private_key=wsp-dtv-magda-test.2022-07-10.private-key.pem

# Add actions-runner-controller helm chart
helm repo add actions-runner-controller https://actions-runner-controller.github.io/actions-runner-controller
helm repo update


# Install the actions-runner-controller
helm upgrade --install --namespace actions-runner-system \
             --wait actions-runner-controller actions-runner-controller/actions-runner-controller \
             --version 0.20.1 \
             --set syncPeriod=3m


# create the service account for K8s hooks. This is required when applying runner manifests that run in kubernetes containermode
kubectl apply -f gh-runner-serviceaccount.yml

# Install the runners manifest for K8s
kubectl apply -f gh-runnerdeploy-magda.yml

# Install the runners deployment
kubectl apply -f gh-runner.yml
