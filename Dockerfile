FROM registry.opensource.zalan.do/stups/node:8.8.0-33

ENV SQLPAD_HOME=/sqlpad-dev
RUN mkdir -p $SQLPAD_HOME/db

WORKDIR $SQLPAD_HOME

ADD package.json $SQLPAD_HOME
RUN npm install
RUN npm install -g node-dev

ADD client-js $SQLPAD_HOME/client-js
ADD lib $SQLPAD_HOME/lib
ADD models $SQLPAD_HOME/models
ADD routes $SQLPAD_HOME/routes
ADD resources $SQLPAD_HOME/resources
ADD public $SQLPAD_HOME/public
ADD middleware $SQLPAD_HOME/middleware

ADD server.js $SQLPAD_HOME

RUN npm run build

CMD node-dev server.js --dir ./db