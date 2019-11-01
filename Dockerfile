FROM node:12.12-alpine

RUN apk add --update \
    python \
    python-dev \
    py-pip \
    build-base \
  && pip install virtualenv \
  && rm -rf /var/cache/apk/*

ENV PORT 8080
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install
COPY . .

EXPOSE 8080
USER node
CMD [ "node", "--abort-on-uncaught-exception", "start.js" ]
