#!/usr/bin/env bash

CLUSTER_NAME=$1

eksctl create cluster --name $CLUSTER_NAME --fargate
eksctl create nodegroup --cluster $CLUSTER_NAME --region ap-southeast-2 --name $CLUSTER_NAME-workers --node-type m5.large --nodes 3 --nodes-min 2 --nodes-max 4

kubectl apply -f https://s3.us-west-2.amazonaws.com/amazon-eks/docs/eks-console-full-access.yaml

eksctl create iamidentitymapping --cluster $CLUSTER_NAME --arn arn:aws:iam::940728446396:user/paul.borg --group eks-console-dashboard-full-access-group --no-duplicate-arns
