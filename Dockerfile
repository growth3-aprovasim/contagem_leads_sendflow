# Imagem base leve e oficial do Node.js 22 LTS (com suporte nativo a WebSocket)
FROM node:22-alpine

# Cria diretório da aplicação
WORKDIR /app

# Define ambiente de produção
ENV NODE_ENV=production
ENV PORT=3000

# Copia manifestos de dependências primeiro para aproveitar o cache do Docker
COPY package*.json ./

# Instala apenas dependências de produção
RUN npm ci --omit=dev

# Copia o restante do código-fonte
COPY src/ ./src/

# Expõe a porta configurada
EXPOSE 3000

# Comando para iniciar o servidor
CMD ["node", "src/index.js"]
