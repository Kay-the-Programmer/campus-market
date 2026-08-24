# ---- Build stage: compiles inside Docker so no local JDK/Maven is required ----
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build

# Retry and longer timeouts: Maven Central connections drop often enough that a
# single flaky read would otherwise fail the whole image build.
ENV MAVEN_OPTS="-Dmaven.wagon.http.retryHandler.count=5 \
    -Dmaven.wagon.httpconnectionManager.ttlSeconds=120 \
    -Dmaven.wagon.http.connectionTimeout=60000 \
    -Dmaven.wagon.http.readTimeout=180000"

# The cache mount keeps ~/.m2 between builds, so a retry resumes with everything
# already downloaded instead of starting the dependency fetch over.
COPY pom.xml .
RUN --mount=type=cache,target=/root/.m2 \
    mvn -B -ntp dependency:go-offline

COPY src ./src
RUN --mount=type=cache,target=/root/.m2 \
    mvn -B -ntp clean package -DskipTests

# ---- Runtime stage ----
FROM eclipse-temurin:21-jre-alpine AS runtime
WORKDIR /app

RUN addgroup -S app && adduser -S app -G app
COPY --from=build /build/target/campusmarket-api-1.0.0.jar app.jar

# Baked in (rather than left for ImageStorageService to create at first run) so
# the ownership is right before the volume in docker-compose.yml is ever
# mounted over it - Docker seeds a fresh named volume from what's already at
# the mount point, permissions included, on its first mount.
RUN mkdir -p /app/uploads && chown -R app:app /app/uploads

USER app

EXPOSE 8080
ENV JAVA_OPTS=""
ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]
