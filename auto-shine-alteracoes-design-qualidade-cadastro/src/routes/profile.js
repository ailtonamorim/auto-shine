const express = require("express");
const bcrypt = require("bcrypt");
const prisma = require("../config/database");
const { autenticarUsuario } = require("../middlewares/auth");
const { salvarImagemUpload } = require("../utils/imagem");
const { normalizarEmail, normalizarTelefone } = require("../utils/validators");

const router = express.Router();

function validarNome(nome) {
  const valor = String(nome || "").trim();
  return valor.length >= 2 && valor.length <= 80;
}

function validarTelefone(telefone) {
  const valor = normalizarTelefone(telefone);
  return valor.length >= 10 && valor.length <= 11;
}

function validarEndereco(endereco) {
  const dados = {
    nome: String(endereco?.nome || "").trim(),
    cep: String(endereco?.cep || "").replace(/\D/g, ""),
    logradouro: String(endereco?.logradouro || "").trim(),
    numero: String(endereco?.numero || "").trim(),
    bairro: String(endereco?.bairro || "").trim(),
    cidade: String(endereco?.cidade || "").trim(),
    uf: String(endereco?.uf || "").trim().toUpperCase(),
    referencia: String(endereco?.referencia || "").trim(),
    complemento: String(endereco?.complemento || "").trim(),
    principal: Boolean(endereco?.principal),
  };

  if (!dados.nome || !dados.logradouro || !dados.numero || !dados.bairro || !dados.cidade || !dados.uf) {
    throw new Error("Preencha todos os campos obrigatórios do endereço.");
  }

  if (dados.cep && dados.cep.length !== 8) {
    throw new Error("CEP inválido.");
  }

  if (!/^[A-Z]{2}$/.test(dados.uf)) {
    throw new Error("UF inválida.");
  }

  return dados;
}

function prepararUsuario(usuario) {
  return {
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    telefone: usuario.telefone || "",
    fotoPerfilUrl: usuario.fotoPerfilUrl || "",
    createdAt: usuario.createdAt,
    hasPassword: Boolean(usuario.senha),
  };
}

router.get("/api/profile", autenticarUsuario, async (req, res) => {
  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: Number(req.usuario.id) },
      include: { enderecos: { orderBy: { principal: "desc" } } },
    });

    if (!usuario) {
      return res.status(404).json({ error: "Usuário não encontrado." });
    }

    return res.json({
      user: prepararUsuario(usuario),
      addresses: usuario.enderecos.map((endereco) => ({
        id: endereco.id,
        nome: endereco.nome,
        cep: endereco.cep,
        logradouro: endereco.logradouro,
        numero: endereco.numero,
        complemento: endereco.complemento,
        bairro: endereco.bairro,
        cidade: endereco.cidade,
        uf: endereco.uf,
        referencia: endereco.referencia,
        principal: endereco.principal,
      })),
    });
  } catch (error) {
    console.error("Erro ao buscar perfil do usuário:", error);
    return res.status(500).json({ error: "Não foi possível carregar o perfil do usuário." });
  }
});

router.post("/api/profile/avatar", autenticarUsuario, async (req, res) => {
  try {
    const { imagem, nomeArquivo } = req.body || {};
    if (!imagem) {
      return res.status(400).json({ error: "Selecione uma imagem para continuar." });
    }

    const { url } = await salvarImagemUpload({
      imagem,
      nomeArquivo: nomeArquivo || "perfil",
      escopo: "perfil",
    });

    const usuario = await prisma.usuario.update({
      where: { id: Number(req.usuario.id) },
      data: { fotoPerfilUrl: url },
    });

    return res.json({
      message: "Foto de perfil atualizada com sucesso.",
      fotoPerfilUrl: usuario.fotoPerfilUrl || "",
      user: prepararUsuario(usuario),
    });
  } catch (error) {
    console.error("Erro ao atualizar foto de perfil:", error);
    const status = error?.status || 500;
    return res.status(status).json({ error: error?.message || "Não foi possível atualizar a foto de perfil." });
  }
});

router.delete("/api/profile/avatar", autenticarUsuario, async (req, res) => {
  try {
    const usuario = await prisma.usuario.update({
      where: { id: Number(req.usuario.id) },
      data: { fotoPerfilUrl: null },
    });

    return res.json({
      message: "Foto de perfil removida com sucesso.",
      fotoPerfilUrl: "",
      user: prepararUsuario(usuario),
    });
  } catch (error) {
    console.error("Erro ao remover foto de perfil:", error);
    return res.status(500).json({ error: "Não foi possível remover a foto de perfil." });
  }
});

router.put("/api/profile", autenticarUsuario, async (req, res) => {
  try {
    const { nome, telefone } = req.body || {};

    if (!validarNome(nome)) {
      return res.status(400).json({ error: "Informe um nome válido com pelo menos 2 caracteres." });
    }

    if (!validarTelefone(telefone)) {
      return res.status(400).json({ error: "Telefone inválido. Use DDD + número com 10 ou 11 dígitos." });
    }

    const emailNormalizado = normalizarEmail(req.usuario.email);
    const usuario = await prisma.usuario.update({
      where: { id: Number(req.usuario.id) },
      data: {
        nome: String(nome).trim(),
        telefone: normalizarTelefone(telefone),
      },
    });

    return res.json({
      message: "Dados pessoais atualizados com sucesso.",
      user: {
        id: usuario.id,
        nome: usuario.nome,
        email: emailNormalizado,
        telefone: usuario.telefone || "",
        fotoPerfilUrl: usuario.fotoPerfilUrl || "",
      },
    });
  } catch (error) {
    console.error("Erro ao atualizar perfil do usuário:", error);
    return res.status(500).json({ error: "Não foi possível atualizar os dados pessoais." });
  }
});

router.post("/api/profile/password", autenticarUsuario, async (req, res) => {
  try {
    const { senhaAtual, novaSenha, confirmarSenha } = req.body || {};

    if (!senhaAtual || !novaSenha || !confirmarSenha) {
      return res.status(400).json({ error: "Preencha a senha atual, a nova senha e a confirmação." });
    }

    if (novaSenha !== confirmarSenha) {
      return res.status(400).json({ error: "A confirmação da nova senha não confere." });
    }

    if (String(novaSenha).length < 8) {
      return res.status(400).json({ error: "A nova senha deve ter pelo menos 8 caracteres." });
    }

    const senhaForte = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(String(novaSenha));
    if (!senhaForte) {
      return res.status(400).json({ error: "A nova senha precisa ter letras e números." });
    }

    const usuario = await prisma.usuario.findUnique({ where: { id: Number(req.usuario.id) } });
    if (!usuario) {
      return res.status(404).json({ error: "Usuário não encontrado." });
    }

    if (!usuario.senha) {
      return res.status(400).json({ error: "Esta conta usa login social e não possui senha cadastrada." });
    }

    const senhaAtualValida = await bcrypt.compare(String(senhaAtual), usuario.senha);
    if (!senhaAtualValida) {
      return res.status(401).json({ error: "A senha atual informada está incorreta." });
    }

    const novaSenhaHash = await bcrypt.hash(String(novaSenha), 10);
    await prisma.usuario.update({
      where: { id: usuario.id },
      data: { senha: novaSenhaHash },
    });

    return res.json({ message: "Senha atualizada com sucesso." });
  } catch (error) {
    console.error("Erro ao atualizar senha:", error);
    return res.status(500).json({ error: "Não foi possível atualizar a senha." });
  }
});

router.post("/api/profile/address", autenticarUsuario, async (req, res) => {
  try {
    const dados = validarEndereco(req.body);
    const usuarioId = Number(req.usuario.id);

    if (dados.principal) {
      await prisma.enderecoUsuario.updateMany({
        where: { usuarioId, principal: true },
        data: { principal: false },
      });
    }

    const endereco = await prisma.enderecoUsuario.create({
      data: {
        usuarioId,
        nome: dados.nome,
        cep: dados.cep,
        logradouro: dados.logradouro,
        numero: dados.numero,
        complemento: dados.complemento,
        bairro: dados.bairro,
        cidade: dados.cidade,
        uf: dados.uf,
        referencia: dados.referencia,
        principal: dados.principal,
      },
    });

    return res.status(201).json({ message: "Endereço adicionado com sucesso.", address: endereco });
  } catch (error) {
    console.error("Erro ao criar endereço:", error);
    const mensagem = error.message || "Não foi possível adicionar o endereço.";
    return res.status(400).json({ error: mensagem });
  }
});

router.put("/api/profile/address/:id", autenticarUsuario, async (req, res) => {
  try {
    const enderecoId = Number(req.params.id);
    const dados = validarEndereco(req.body);

    const enderecoAtual = await prisma.enderecoUsuario.findUnique({ where: { id: enderecoId } });
    if (!enderecoAtual || enderecoAtual.usuarioId !== Number(req.usuario.id)) {
      return res.status(403).json({ error: "Você não tem permissão para alterar este endereço." });
    }

    if (dados.principal) {
      await prisma.enderecoUsuario.updateMany({
        where: { usuarioId: Number(req.usuario.id), principal: true, id: { not: enderecoId } },
        data: { principal: false },
      });
    }

    const endereco = await prisma.enderecoUsuario.update({
      where: { id: enderecoId },
      data: {
        nome: dados.nome,
        cep: dados.cep,
        logradouro: dados.logradouro,
        numero: dados.numero,
        complemento: dados.complemento,
        bairro: dados.bairro,
        cidade: dados.cidade,
        uf: dados.uf,
        referencia: dados.referencia,
        principal: dados.principal,
      },
    });

    return res.json({ message: "Endereço atualizado com sucesso.", address: endereco });
  } catch (error) {
    console.error("Erro ao atualizar endereço:", error);
    const mensagem = error.message || "Não foi possível atualizar o endereço.";
    return res.status(400).json({ error: mensagem });
  }
});

router.delete("/api/profile/address/:id", autenticarUsuario, async (req, res) => {
  try {
    const enderecoId = Number(req.params.id);
    const endereco = await prisma.enderecoUsuario.findUnique({ where: { id: enderecoId } });

    if (!endereco || endereco.usuarioId !== Number(req.usuario.id)) {
      return res.status(403).json({ error: "Você não tem permissão para remover este endereço." });
    }

    await prisma.enderecoUsuario.delete({ where: { id: enderecoId } });
    return res.json({ message: "Endereço removido com sucesso." });
  } catch (error) {
    console.error("Erro ao remover endereço:", error);
    return res.status(500).json({ error: "Não foi possível remover o endereço." });
  }
});

module.exports = router;
