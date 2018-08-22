#!/usr/bin/env bash

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null && pwd )"

PROJECT_NAME=`cat "${DIR}/../.projectname"`
MEMORY="128MB"
REGION="asia-northeast1"
ENTRYPOINT="http"
NODEJS="nodejs8"
TIMEOUT="60s"
ENV_FILE="${DIR}/../.env.yaml"
SOURCE="${DIR}/../"

export PUBSUB_EMULATOR_HOST="localhost:8010"

VARS=`cat "$ENV_FILE" | shyaml key-values`
VARS=`echo "$VARS" | sed '$!N;s/\n/=/'`
while read -r line; do
  VAR=`cut -f1 -d'='`
  VALUE=`cut -f2 -d'='`
  export ${VAR}=${VALUE}
done <<< "$VARS"

if [[ $1 == "production" ]]; then
  gcloud beta functions deploy \
    "$PROJECT_NAME" \
    --source "$SOURCE" \
    --runtime "$NODEJS" \
    --timeout "$TIMEOUT" \
    --trigger-http \
    --entry-point "$ENTRYPOINT" \
    --region "$REGION" \
    --memory "$MEMORY" \
    --env-vars-file "$ENV_FILE"
else
  functions deploy \
    "$PROJECT_NAME" \
    --source "$SOURCE" \
    --timeout "$TIMEOUT" \
    --trigger-http \
    --entry-point "$ENTRYPOINT" \
    --region "$REGION" \
    --env-vars-file "$ENV_FILE"
fi
