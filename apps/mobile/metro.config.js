// O monorepo é configurado automaticamente pelo Expo (SDK 52+). Único ajuste:
// os pacotes TS do workspace (@relogio/calc) importam "./x.js" apontando para "./x.ts"
// (convenção ESM/NodeNext usada pelo vitest/tsc); o Metro não faz essa troca sozinho.
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith(".") && moduleName.endsWith(".js") && /\.tsx?$/.test(context.originModulePath)) {
    try {
      return context.resolveRequest(context, moduleName.slice(0, -3), platform);
    } catch {
      // não existe .ts correspondente: segue a resolução normal
    }
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
