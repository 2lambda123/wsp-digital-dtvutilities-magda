export JWT_SECRET="Eib7wazeiquaich4weeheS1ja6ohJo5o"
export SESSION_SECRET="ohgei7Tho8eihah9fei0pheji9Hatah6"
export DB_PASSWORD="ZueoGecxzY4hkk1F"
export MINIO_ACCESS_KEY="Ein5Diquiegh4quin3Eeva4bai8ief6a"
export MINIO_SECRET_KEY="vadahburafai8jouW7ufo1aef1YeiQui"
export DB_MASTER_PASSWORD="ZueoGecxzY4hkk1F"
export SMTP_USERNAME=""
export SMTP_PASSWORD=""

kubectl create secret generic cloudsql-db-credentials --namespace magda --from-literal=password=$DB_MASTER_PASSWORD

kubectl create secret generic auth-secrets --namespace magda --from-literal=jwt-secret=$JWT_SECRET --from-literal=session-secret=$SESSION_SECRET

kubectl --namespace magda annotate --overwrite secret auth-secrets replicator.v1.mittwald.de/replication-allowed=true replicator.v1.mittwald.de/replication-allowed-namespaces=magda-openfaas-fn

kubectl create secret generic db-passwords --namespace magda \
--from-literal=combined-db=$DB_PASSWORD \
--from-literal=authorization-db=$DB_PASSWORD \
--from-literal=content-db=$DB_PASSWORD \
--from-literal=session-db=$DB_PASSWORD  \
--from-literal=registry-db=$DB_PASSWORD \
--from-literal=combined-db-client=$DB_PASSWORD \
--from-literal=authorization-db-client=$DB_PASSWORD \
--from-literal=content-db-client=$DB_PASSWORD \
--from-literal=session-db-client=$DB_PASSWORD \
--from-literal=registry-db-client=$DB_PASSWORD \
--from-literal=tenant-db=$DB_PASSWORD \
--from-literal=tenant-db-client=$DB_PASSWORD

kubectl create secret generic storage-secrets --namespace magda --from-literal=accesskey=$MINIO_ACCESS_KEY --from-literal=secretkey=$MINIO_SECRET_KEY

kubectl create secret generic smtp-secret --namespace magda --from-literal=username=$SMTP_USERNAME --from-literal=password=$SMTP_PASSWORD

sed -i "s/^export JWT_SECRET=.*/export JWT_SECRET=\"${JWT_SECRET}\"/" $0
sed -i "s/^export SESSION_SECRET=.*/export SESSION_SECRET=\"${SESSION_SECRET}\"/" $0
sed -i "s/^export MINIO_ACCESS_KEY=.*/export MINIO_ACCESS_KEY=\"${MINIO_ACCESS_KEY}\"/" $0
sed -i "s/^export MINIO_SECRET_KEY=.*/export MINIO_SECRET_KEY=\"${MINIO_SECRET_KEY}\"/" $0
sed -i "s/^export DB_PASSWORD=.*/export DB_PASSWORD=\"${DB_PASSWORD}\"/" $0
sed -i "s/^export DB_MASTER_PASSWORD=.*/export DB_MASTER_PASSWORD=\"${DB_MASTER_PASSWORD}\"/" $0
sed -i "s/^export SMTP_USERNAME=.*/export SMTP_USERNAME=\"${SMTP_USERNAME}\"/" $0
sed -i "s/^export SMTP_PASSWORD=.*/export SMTP_PASSWORD=\"${SMTP_PASSWORD}\"/" $0
