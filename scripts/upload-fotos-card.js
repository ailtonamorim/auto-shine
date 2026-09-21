const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const { PrismaClient } = require("@prisma/client");
const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const prisma = new PrismaClient();

const PASTA = "C:\\Users\\Amori\\Downloads\\fotocard";

async function uploadFoto(filePath) {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload(
      filePath,
      { folder: "autoshine/loja", resource_type: "image" },
      (error, result) => (error ? reject(error) : resolve(result.secure_url))
    );
  });
}

async function main() {
  const arquivos = fs.readdirSync(PASTA).filter((f) => /\.(png|jpe?g|webp)$/i.test(f));

  for (const arquivo of arquivos) {
    const nomeLoja = path.basename(arquivo, path.extname(arquivo));
    const filePath = path.join(PASTA, arquivo);

    console.log(`\nProcessando: ${nomeLoja}`);

    const loja = await prisma.loja.findFirst({
      where: { nome: { contains: nomeLoja, mode: "insensitive" } },
      select: { id: true, nome: true },
    });

    if (!loja) {
      console.log(`  ⚠️  Loja não encontrada para: "${nomeLoja}"`);
      continue;
    }

    console.log(`  Loja encontrada: ${loja.nome} (id: ${loja.id})`);
    console.log(`  Fazendo upload para o Cloudinary...`);

    const url = await uploadFoto(filePath);
    console.log(`  URL: ${url}`);

    await prisma.loja.update({
      where: { id: loja.id },
      data: { fotoUrl: url, capaUrl: url },
    });

    console.log(`  ✅ Atualizado com sucesso!`);
  }

  console.log("\n✅ Todos os cards atualizados!");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  prisma.$disconnect();
});
