/**
 * Funções de Auditoria de Acesso a Dados Sensíveis
 * Registra todas as ações críticas para conformidade e investigação
 */

const prisma = require("../config/database");
const { logger } = require("./logger");

/**
 * Tipos de ações auditáveis
 */
const TiposAcao = {
  CRIAR: "CRIAR",
  ATUALIZAR: "ATUALIZAR",
  DELETAR: "DELETAR",
  ACESSAR: "ACESSAR",
  EXPORTAR: "EXPORTAR",
  LOGIN: "LOGIN",
  LOGIN_FALHOU: "LOGIN_FALHOU",
  RESET_SENHA: "RESET_SENHA",
  DENUNCIA: "DENUNCIA",
};

/**
 * Registra uma ação auditada no banco de dados
 * @param {Object} params - Parâmetros da auditoria
 * @param {string} params.acao - Tipo de ação (CRIAR, ATUALIZAR, etc)
 * @param {string} params.tabela - Nome da tabela afetada
 * @param {number} params.recordId - ID do registro afetado
 * @param {number} params.usuarioId - ID do usuário que fez a ação
 * @param {string} params.enderecoIp - IP do usuário
 * @param {Object} params.detalhes - Detalhes adicionais (JSON)
 * @param {boolean} params.sucesso - Se a ação foi bem-sucedida
 * @param {string} params.erro - Mensagem de erro (se houver)
 * @returns {Promise<Object>} Registro de auditoria criado
 */
async function registrarAudit({
  acao,
  tabela,
  recordId = null,
  usuarioId = null,
  enderecoIp,
  detalhes = {},
  sucesso = true,
  erro = null,
}) {
  try {
    if (!acao || !tabela) {
      logger.error("Auditoria: parâmetros obrigatórios faltando");
      return null;
    }

    // Valida ação
    if (!Object.values(TiposAcao).includes(acao)) {
      logger.warn(`Auditoria: ação desconhecida: ${acao}`);
    }

    // Extrai IP da requisição se não fornecido
    let ip = enderecoIp;
    if (!ip) {
      ip = "DESCONHECIDO";
    }

    // Cria registro de auditoria
    const auditLog = await prisma.auditLog.create({
      data: {
        acao,
        tabela,
        recordId,
        usuarioId,
        enderecoIp: ip,
        detalhes: JSON.stringify(detalhes),
        sucesso,
        erro: erro ? erro.substring(0, 500) : null,
        createdAt: new Date(),
      },
    });

    // Log no console para monitoramento
    const status = sucesso ? "✅" : "❌";
    logger.info(
      `[AUDIT] ${status} ${acao} | Tabela: ${tabela} | User: ${usuarioId || "ANÔNIMO"} | IP: ${ip}`
    );

    return auditLog;
  } catch (err) {
    logger.error("Erro ao registrar auditoria:", err);
    // Não retorna erro para não quebrar a requisição principal
    return null;
  }
}

/**
 * Registra tentativa de login (bem-sucedida ou não)
 * @param {Object} params - Parâmetros
 * @param {string} params.usuarioEmail - Email do usuário que tentou login
 * @param {number} params.usuarioId - ID do usuário (null se falhou)
 * @param {boolean} params.sucesso - Se o login foi bem-sucedido
 * @param {string} params.enderecoIp - IP do usuário
 * @param {string} params.motivo - Motivo se falhou (email não encontrado, senha errada, etc)
 * @returns {Promise<Object>} Registro de auditoria criado
 */
async function registrarLogin({
  usuarioEmail,
  usuarioId = null,
  sucesso = true,
  enderecoIp,
  motivo = null,
}) {
  return registrarAudit({
    acao: sucesso ? TiposAcao.LOGIN : TiposAcao.LOGIN_FALHOU,
    tabela: "Usuario",
    recordId: usuarioId,
    usuarioId,
    enderecoIp,
    detalhes: {
      email: usuarioEmail,
      motivo: motivo || (sucesso ? "Login bem-sucedido" : "Login falhou"),
    },
    sucesso,
  });
}

/**
 * Registra resetde senha
 * @param {Object} params - Parâmetros
 * @param {number} params.usuarioId - ID do usuário
 * @param {string} params.usuarioEmail - Email do usuário
 * @param {string} params.enderecoIp - IP do usuário
 * @param {boolean} params.sucesso - Se o reset foi bem-sucedido
 * @returns {Promise<Object>} Registro de auditoria criado
 */
async function registrarResetSenha({
  usuarioId,
  usuarioEmail,
  enderecoIp,
  sucesso = true,
}) {
  return registrarAudit({
    acao: TiposAcao.RESET_SENHA,
    tabela: "Usuario",
    recordId: usuarioId,
    usuarioId,
    enderecoIp,
    detalhes: { email: usuarioEmail },
    sucesso,
  });
}

/**
 * Registra criação de denúncia
 * @param {Object} params - Parâmetros
 * @param {number} params.denunciaId - ID da denúncia criada
 * @param {number} params.usuarioId - ID de quem criou
 * @param {string} params.tipo - Tipo de denúncia
 * @param {number} params.lojaId - ID da loja denunciada
 * @param {string} params.enderecoIp - IP do usuário
 * @returns {Promise<Object>} Registro de auditoria criado
 */
async function registrarDenuncia({
  denunciaId,
  usuarioId,
  tipo,
  lojaId,
  enderecoIp,
}) {
  return registrarAudit({
    acao: TiposAcao.DENUNCIA,
    tabela: "Denuncia",
    recordId: denunciaId,
    usuarioId,
    enderecoIp,
    detalhes: { tipo, lojaId },
    sucesso: true,
  });
}

/**
 * Registra acesso a dados sensíveis de usuário
 * @param {Object} params - Parâmetros
 * @param {number} params.usuarioIdAcessado - ID do usuário cujos dados foram acessados
 * @param {number} params.usuarioIdAtual - ID de quem acessou
 * @param {string} params.campos - Campos acessados (ex: "cpf,telefone")
 * @param {string} params.enderecoIp - IP da requisição
 * @returns {Promise<Object>} Registro de auditoria criado
 */
async function registrarAcessoDados({
  usuarioIdAcessado,
  usuarioIdAtual,
  campos = "dados_sensíveis",
  enderecoIp,
}) {
  return registrarAudit({
    acao: TiposAcao.ACESSAR,
    tabela: "Usuario",
    recordId: usuarioIdAcessado,
    usuarioId: usuarioIdAtual,
    enderecoIp,
    detalhes: { campos },
    sucesso: true,
  });
}

/**
 * Registra exportação de dados (LGPD)
 * @param {Object} params - Parâmetros
 * @param {number} params.usuarioId - ID do usuário que exportou
 * @param {string} params.formato - Formato da exportação (JSON, CSV, etc)
 * @param {string} params.enderecoIp - IP do usuário
 * @returns {Promise<Object>} Registro de auditoria criado
 */
async function registrarExportacao({
  usuarioId,
  formato = "JSON",
  enderecoIp,
}) {
  return registrarAudit({
    acao: TiposAcao.EXPORTAR,
    tabela: "Usuario",
    recordId: usuarioId,
    usuarioId,
    enderecoIp,
    detalhes: { formato },
    sucesso: true,
  });
}

/**
 * Busca logs de auditoria com filtros
 * @param {Object} filters - Filtros
 * @param {string} filters.acao - Tipo de ação
 * @param {string} filters.tabela - Nome da tabela
 * @param {number} filters.usuarioId - ID do usuário
 * @param {number} filters.diasRetro - Dias para trás (default: 30)
 * @param {number} filters.limite - Limite de registros (default: 100)
 * @returns {Promise<Array>} Array de logs de auditoria
 */
async function buscarAudits({
  acao = null,
  tabela = null,
  usuarioId = null,
  diasRetro = 30,
  limite = 100,
}) {
  try {
    const dataInicio = new Date();
    dataInicio.setDate(dataInicio.getDate() - diasRetro);

    const where = {
      createdAt: { gte: dataInicio },
    };

    if (acao) where.acao = acao;
    if (tabela) where.tabela = tabela;
    if (usuarioId) where.usuarioId = usuarioId;

    return await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: Math.min(limite, 1000), // Máximo 1000
    });
  } catch (err) {
    console.error("Erro ao buscar audits:", err);
    return [];
  }
}

/**
 * Resumo de atividades suspeitas
 * @param {number} diasRetro - Dias para trás
 * @returns {Promise<Object>} Resumo de suspeitas
 */
async function resumoSuspeitas(diasRetro = 7) {
  try {
    const dataInicio = new Date();
    dataInicio.setDate(dataInicio.getDate() - diasRetro);

    // Logins falhados
    const loginsFalhados = await prisma.auditLog.count({
      where: {
        acao: TiposAcao.LOGIN_FALHOU,
        createdAt: { gte: dataInicio },
      },
    });

    // IPs suspeitos (muitos acessos em pouco tempo)
    const acessosPorIp = await prisma.auditLog.groupBy({
      by: ["enderecoIp"],
      where: { createdAt: { gte: dataInicio } },
      _count: true,
    });

    const ipsSuspeitos = acessosPorIp.filter((item) => item._count > 100);

    // Denúncias
    const denuncias = await prisma.auditLog.count({
      where: {
        acao: TiposAcao.DENUNCIA,
        createdAt: { gte: dataInicio },
      },
    });

    return {
      periodo: { dataInicio, dataFim: new Date() },
      loginsFalhados,
      ipsSuspeitos: ipsSuspeitos.length,
      denuncias,
      alertas: [
        loginsFalhados > 50 && "⚠️ Muitos logins falhados",
        ipsSuspeitos.length > 0 && "⚠️ IPs com atividade suspeita",
        denuncias > 20 && "⚠️ Muitas denúncias",
      ].filter(Boolean),
    };
  } catch (err) {
    console.error("Erro ao gerar resumo de suspeitas:", err);
    return { erro: "Não foi possível gerar resumo" };
  }
}

module.exports = {
  TiposAcao,
  registrarAudit,
  registrarLogin,
  registrarResetSenha,
  registrarDenuncia,
  registrarAcessoDados,
  registrarExportacao,
  buscarAudits,
  resumoSuspeitas,
};
