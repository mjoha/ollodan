FROM node:22-alpine AS frontend
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY scripts ./scripts
COPY src ./src
COPY tsconfig.json ./
RUN npm run build

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS api
WORKDIR /src
COPY api/Ollodan.Api/Ollodan.Api.csproj api/Ollodan.Api/
RUN dotnet restore api/Ollodan.Api/Ollodan.Api.csproj
COPY api/Ollodan.Api/ api/Ollodan.Api/
COPY --from=frontend /app/api/Ollodan.Api/wwwroot api/Ollodan.Api/wwwroot/
RUN dotnet publish api/Ollodan.Api/Ollodan.Api.csproj -c Release -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=api /app/publish .
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
ENTRYPOINT ["dotnet", "Ollodan.Api.dll"]
