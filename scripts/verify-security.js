/**
 * Script de Verificação de Implementação de Segurança
 * Valida se todas as mudanças foram aplicadas corretamente
 */

const fs = require("fs");
const path = require("path");

const checks = {
  passed: 0,
  failed: 0,
  warnings: 0,
  results: [],
};

function addResult(name, passed, message = "") {
  checks.results.push({ name, passed, message });
  if (passed) {
    checks.passed++;
    console.log(`✅ ${name}`);
  } else {
    checks.failed++;
    console.log(`❌ ${name}`);
  }
  if (message) console.log(`   └─ ${message}`);
}

function checkFileExists(filepath) {
  return fs.existsSync(path.join(__dirname, filepath));
}

function checkFileContains(filepath, search) {
  const content = fs.readFileSync(path.join(__dirname, filepath), "utf8");
  return content.includes(search);
}

console.log("\n🔍 VERIFICAÇÃO DE SEGURANÇA - AUTO SHINE\n");
console.log("=".repeat(60));

// Fase 1: Schema & Índices
console.log("\n📊 FASE 1: SCHEMA & ÍNDICES");
console.log("-".repeat(60));

addResult(
  "Schema: telefoneIndex no Usuario",
  checkFileContains("../prisma/schema.prisma", "telefoneIndex"),
  "Campo adicionado para índice de telefone"
);

addResult(
  "Schema: nomeClienteIndex no Agendamento",
  checkFileContains("../prisma/schema.prisma", "nomeClienteIndex"),
  "Campo adicionado para índice de nome cliente"
);

addResult(
  "Schema: emailClienteIndex no Agendamento",
  checkFileContains("../prisma/schema.prisma", "emailClienteIndex"),
  "Campo adicionado para índice de email cliente"
);

addResult(
  "Schema: motivoCipher no Denuncia",
  checkFileContains("../prisma/schema.prisma", "motivoCipher"),
  "Campo adicionado para criptografia de motivo"
);

addResult(
  "Schema: motivoIndex no Denuncia",
  checkFileContains("../prisma/schema.prisma", "motivoIndex"),
  "Campo adicionado para índice de motivo"
);

addResult(
  "Schema: AuditLog model",
  checkFileContains("../prisma/schema.prisma", "model AuditLog"),
  "Modelo de auditoria adicionado"
);

// Auth.js
console.log("\n🔐 VERIFICAÇÃO: AUTH.js");
console.log("-".repeat(60));

addResult(
  "Auth: telefoneIndex no signup",
  checkFileContains("../src/routes/auth.js", "telefoneIndex: criarIndice"),
  "Índice de telefone criado no cadastro"
);

// Agendamentos.js
console.log("\n📅 VERIFICAÇÃO: AGENDAMENTOS.js");
console.log("-".repeat(60));

addResult(
  "Agendamentos: criarIndice importado",
  checkFileContains("../src/routes/agendamentos.js", "criarIndice"),
  "Função de índice importada"
);

addResult(
  "Agendamentos: nomeClienteIndex criado",
  checkFileContains("../src/routes/agendamentos.js", "nomeClienteIndex: criarIndice"),
  "Índice de nome cliente criado"
);

addResult(
  "Agendamentos: emailClienteIndex criado",
  checkFileContains("../src/routes/agendamentos.js", "emailClienteIndex: criarIndice"),
  "Índice de email cliente criado"
);

// Denuncias.js
console.log("\n🚨 VERIFICAÇÃO: DENUNCIAS.js");
console.log("-".repeat(60));

addResult(
  "Denuncias: criptografar importado",
  checkFileContains("../src/routes/denuncias.js", "criptografar"),
  "Função de criptografia importada"
);

addResult(
  "Denuncias: motivoCipher criado",
  checkFileContains("../src/routes/denuncias.js", "motivoCipher"),
  "Motivo de denúncia criptografado"
);

addResult(
  "Denuncias: motivoIndex criado",
  checkFileContains("../src/routes/denuncias.js", "motivoIndex"),
  "Índice de motivo criado"
);

// Fase 2: Masking
console.log("\n🎭 FASE 2: MASKING & SANITIZAÇÃO");
console.log("-".repeat(60));

addResult(
  "Arquivo: masking.js criado",
  checkFileContains("../src/utils/masking.js", "mascararNomeCliente"),
  "Funções de mascaração implementadas"
);

if (checkFileContains("../src/utils/masking.js", "mascararNomeCliente")) {
  addResult(
    "Masking: mascararNomeCliente",
    checkFileContains("../src/utils/masking.js", "mascararNomeCliente"),
    "Função de mascaração de nome implementada"
  );

  addResult(
    "Masking: arredondarGPS",
    checkFileContains("../src/utils/masking.js", "arredondarGPS"),
    "Função de arredondamento de GPS implementada"
  );

  addResult(
    "Masking: sanitizarTexto",
    checkFileContains("../src/utils/masking.js", "sanitizarTexto"),
    "Função de sanitização implementada"
  );
}

// Fase 3: Audit
console.log("\n📋 FASE 3: AUDIT LOGGING");
console.log("-".repeat(60));

addResult(
  "Arquivo: audit.js criado",
  checkFileContains("../src/utils/audit.js", "registrarAudit"),
  "Funções de auditoria implementadas"
);

if (checkFileContains("../src/utils/audit.js", "registrarAudit")) {
  addResult(
    "Audit: registrarAudit",
    checkFileContains("../src/utils/audit.js", "registrarAudit"),
    "Função de registro de auditoria implementada"
  );

  addResult(
    "Audit: registrarLogin",
    checkFileContains("../src/utils/audit.js", "registrarLogin"),
    "Função de auditoria de login implementada"
  );

  addResult(
    "Audit: TiposAcao",
    checkFileContains("../src/utils/audit.js", "TiposAcao"),
    "Tipos de ação de auditoria definidos"
  );
}

// Resumo
console.log("\n" + "=".repeat(60));
console.log("\n📊 RESUMO DA VERIFICAÇÃO");
console.log(`✅ Passou: ${checks.passed}`);
console.log(`❌ Falhou: ${checks.failed}`);
console.log(`⚠️  Avisos: ${checks.warnings}`);

const taxa = Math.round((checks.passed / checks.results.length) * 100);
console.log(`\n📈 Taxa de conformidade: ${taxa}%`);

if (checks.failed === 0) {
  console.log("\n🎉 EXCELENTE! Todas as implementações foram aplicadas com sucesso!");
} else {
  console.log("\n⚠️  Algumas implementações ainda precisam ser completadas.");
  console.log("\nItens faltando:");
  checks.results
    .filter((r) => !r.passed)
    .forEach((r) => console.log(`  - ${r.name}`));
}

console.log("\n" + "=".repeat(60) + "\n");

// Próximos passos
console.log("📋 PRÓXIMOS PASSOS:");
console.log("1. Executar: npx prisma migrate dev --name add_security_fields");
console.log("2. Testar endpoints: npm test");
console.log("3. Revisar logs: Verificar /admin/audit");
console.log("4. Deploy em staging e validar");
console.log("\n");

module.exports = checks;



