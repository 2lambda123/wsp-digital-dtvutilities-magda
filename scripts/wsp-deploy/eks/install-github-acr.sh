#!/usr/bin/env bash

APP_ID          = ${1:-218756} 
INSTALLTION_ID  = ${2:-27277385}
KEY_PATH        = ${KEY_PATH:-wsp-dtv-magda-test.2022-07-10.private-key.pem}
CERTMAN_VERSION = ${4:-v1.8.2} 
RUNNER_VERSION  = ${5:-0.20.1} 
SYNC_PERIOD     = ${6:-3m} 
K8_NAMSPACE     = ${7:-actions-runner-system} 
RUNNER_YAML     = ${8:-gh-runner.yml} 

# install cert-manager which is a pre-requisite
helm install \
cert-manager jetstack/cert-manager \
--namespace cert-manager \
--create-namespace \
--version $CERTMAN_VERSION \
--set installCRDs=true

# create namespace
kubectl create namespace $K8_NAMSPACE

# creates secret which will apply the app and installation id to a kube secret
kubectl create secret generic controller-manager \
-n $K8_NAMSPACE \
--from-literal=github_app_id=$APP_ID \
--from-literal=github_app_installation_id=$INSTALLTION_ID \
--from-file=github_app_private_key=$KEY_PATH

# Add actions-runner-controller helm chart
helm repo add actions-runner-controller https://actions-runner-controller.github.io/actions-runner-controller
helm repo update


# Install the actions-runner-controller
helm upgrade --install --namespace $K8_NAMSPACE \
             --wait actions-runner-controller actions-runner-controller/actions-runner-controller \
             --version $RUNNER_VERSION \
             --set syncPeriod=$SYNC_PERIOD

# Install the runners themselves
kubectl apply -f $RUNNER_YAML
