ARG ISAIAH_IRIS_IMAGE=irishealth-community:2026.3.0AI.154.0
FROM ${ISAIAH_IRIS_IMAGE}

USER root
WORKDIR /opt/isaiah
COPY --chown=irisowner:irisowner module.xml LICENSE NOTICE.md ./
COPY --chown=irisowner:irisowner iris/ ./iris/
COPY --chown=irisowner:irisowner --chmod=0755 docker/provision.sh ./provision.sh
COPY --chown=irisowner:irisowner --chmod=0755 cloud/check-secrets.sh ./cloud/check-secrets.sh
COPY --chown=irisowner:irisowner cloud/credentials.py cloud/entrypoint.py ./cloud/
ADD --chown=irisowner:irisowner --checksum=sha256:daa2adabd66b488f57187d29712e54b0c25bbe000794fbf2a35a882c458b788a https://github.com/intersystems/ipm/releases/download/v0.10.10/zpm-0.10.10.xml ./zpm.xml
RUN mkdir -p /run/secrets && chown irisowner:irisowner /run/secrets && chmod 0700 /run/secrets

ENV ISAIAH_COMPOSE=1 ISAIAH_EDITION=iris-for-health
USER irisowner
EXPOSE 52773
HEALTHCHECK --interval=10s --timeout=5s --start-period=120s --retries=4 CMD /irisHealth.sh && test -f /tmp/isaiah-private/ready
ENTRYPOINT ["python3", "/opt/isaiah/cloud/entrypoint.py"]
CMD []
