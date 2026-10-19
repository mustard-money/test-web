# The test runner: Playwright with its Chromium, plus these tests.
# The image tag must match @playwright/test in package.json.
FROM mcr.microsoft.com/playwright:v1.63.0-noble
WORKDIR /tests

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
CMD ["npx", "playwright", "test"]
