import { Request, Response } from "express";
import { Luminosidade } from "@prisma/client";
import * as PlantaRepository from "@repositories/PlantaRepository";

// Maior valor que cabe em um Int do PostgreSQL. Acima disso o banco dá erro.
const MAX_INT = 2147483647;

// Confere se o valor é um inteiro dentro do intervalo [min, MAX_INT].
// Number.isInteger recusa "8990" (texto), 89.9 e NaN.
const isIntegerInRange = (value: unknown, min: number) => {
  return Number.isInteger(value) && (value as number) >= min && (value as number) <= MAX_INT;
};

// O :id chega da URL como texto. Devolve o número, ou null se não for um id válido.
const parseId = (raw: string): number | null => {
  // A regex recusa formatos como "1e2" ou "0x10", que o Number() aceitaria
  if (!/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return id > 0 && id <= MAX_INT ? id : null;
};

// Valida os campos da planta e devolve a mensagem do primeiro erro (ou null se tudo certo).
// parcial = false (POST): todos os campos são obrigatórios.
// parcial = true (PATCH): só valida os campos que vieram.
// Comparamos com undefined (e não com !campo) porque estoque 0 e petFriendly false são válidos.
const validatePlanta = (body: Record<string, unknown>, parcial: boolean): string | null => {
  const { nome, especie, preco, estoque, luminosidade, petFriendly, regaACadaDias } = body;

  if (!parcial) {
    const obrigatorios = { nome, especie, preco, estoque, luminosidade, petFriendly, regaACadaDias };
    const faltando = Object.entries(obrigatorios)
      .filter(([, valor]) => valor === undefined)
      .map(([campo]) => campo);

    if (faltando.length > 0) {
      return `Campos obrigatórios ausentes: ${faltando.join(", ")}.`;
    }
  }

  if (nome !== undefined && (typeof nome !== "string" || nome.trim() === "")) {
    return "nome deve ser um texto não vazio.";
  }
  if (especie !== undefined && (typeof especie !== "string" || especie.trim() === "")) {
    return "especie deve ser um texto não vazio.";
  }
  if (preco !== undefined && !isIntegerInRange(preco, 1)) {
    return "preco deve ser um número inteiro maior que zero, em centavos.";
  }
  if (estoque !== undefined && !isIntegerInRange(estoque, 0)) {
    return "estoque deve ser um número inteiro maior ou igual a zero.";
  }
  if (
    luminosidade !== undefined &&
    !Object.values(Luminosidade).includes(luminosidade as Luminosidade)
  ) {
    return "luminosidade deve ser SOMBRA, MEIA_SOMBRA ou SOL_PLENO.";
  }
  if (petFriendly !== undefined && typeof petFriendly !== "boolean") {
    return "petFriendly deve ser true ou false.";
  }
  if (regaACadaDias !== undefined && !isIntegerInRange(regaACadaDias, 1)) {
    return "regaACadaDias deve ser um número inteiro maior ou igual a 1.";
  }

  return null;
};

export const createPlanta = async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};

    const erro = validatePlanta(body, false);
    if (erro) {
      return res.status(400).json({ message: erro });
    }

    // Desestruturamos para mandar ao banco só os campos da planta (nunca o req.body inteiro)
    const { nome, especie, preco, estoque, luminosidade, petFriendly, regaACadaDias } = body;

    const planta = await PlantaRepository.createPlanta({
      nome: nome,
      especie: especie,
      preco: preco,
      estoque: estoque,
      luminosidade: luminosidade,
      petFriendly: petFriendly,
      regaACadaDias: regaACadaDias,
    });

    return res.status(201).json(planta);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Erro ao criar planta." });
  }
};

export const readAllPlantas = async (req: Request, res: Response) => {
  try {
    // Os filtros chegam em req.query e são sempre texto
    const { luminosidade, petFriendly, nome, ordem } = req.query;

    if (
      luminosidade !== undefined &&
      (typeof luminosidade !== "string" ||
        !Object.values(Luminosidade).includes(luminosidade as Luminosidade))
    ) {
      return res.status(400).json({
        message: "Filtro luminosidade inválido. Use SOMBRA, MEIA_SOMBRA ou SOL_PLENO.",
      });
    }

    if (petFriendly !== undefined && petFriendly !== "true" && petFriendly !== "false") {
      return res.status(400).json({
        message: "Filtro petFriendly inválido. Use true ou false.",
      });
    }

    if (nome !== undefined && typeof nome !== "string") {
      return res.status(400).json({ message: "Filtro nome inválido." });
    }

    if (ordem !== undefined && ordem !== "preco" && ordem !== "nome") {
      return res.status(400).json({
        message: "Parâmetro ordem inválido. Use preco ou nome.",
      });
    }

    const plantas = await PlantaRepository.findAllPlantas({
      luminosidade: luminosidade as Luminosidade | undefined,
      // Filtro não enviado continua undefined (e não vira false)
      petFriendly: petFriendly === undefined ? undefined : petFriendly === "true",
      nome: nome as string | undefined,
      ordem: ordem as "preco" | "nome" | undefined,
    });

    // Filtro válido sem resultado é 200 com [], nunca 404
    return res.status(200).json(plantas);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Erro ao buscar plantas." });
  }
};

export const readPlantaById = async (req: Request, res: Response) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) {
      return res.status(400).json({ message: "id inválido. Envie um número inteiro positivo." });
    }

    const planta = await PlantaRepository.findPlantaById(id);

    if (!planta) {
      return res.status(404).json({ message: "Planta não encontrada." });
    }

    return res.status(200).json(planta);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Erro ao buscar planta." });
  }
};

export const updatePlanta = async (req: Request, res: Response) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) {
      return res.status(400).json({ message: "id inválido. Envie um número inteiro positivo." });
    }

    const body = req.body ?? {};

    // Na edição nenhum campo é obrigatório, mas os que vierem seguem as mesmas regras
    const erro = validatePlanta(body, true);
    if (erro) {
      return res.status(400).json({ message: erro });
    }

    const planta = await PlantaRepository.findPlantaById(id);
    if (!planta) {
      return res.status(404).json({ message: "Planta não encontrada." });
    }

    const { nome, especie, preco, estoque, luminosidade, petFriendly, regaACadaDias } = body;

    // PATCH = atualização parcial: campos não enviados (undefined) não são alterados
    const updatedPlanta = await PlantaRepository.updatePlanta(id, {
      nome: nome,
      especie: especie,
      preco: preco,
      estoque: estoque,
      luminosidade: luminosidade,
      petFriendly: petFriendly,
      regaACadaDias: regaACadaDias,
    });

    return res.status(200).json(updatedPlanta);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Erro ao atualizar planta." });
  }
};

export const deletePlanta = async (req: Request, res: Response) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) {
      return res.status(400).json({ message: "id inválido. Envie um número inteiro positivo." });
    }

    const planta = await PlantaRepository.findPlantaById(id);
    if (!planta) {
      return res.status(404).json({ message: "Planta não encontrada." });
    }

    await PlantaRepository.deletePlanta(id);

    return res.status(204).send();
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Erro ao deletar planta." });
  }
};

export const sellPlanta = async (req: Request, res: Response) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) {
      return res.status(400).json({ message: "id inválido. Envie um número inteiro positivo." });
    }

    const quantidade = (req.body ?? {}).quantidade;
    if (!isIntegerInRange(quantidade, 1)) {
      return res.status(400).json({
        message: "quantidade deve ser um número inteiro maior que zero.",
      });
    }

    const planta = await PlantaRepository.findPlantaById(id);
    if (!planta) {
      return res.status(404).json({ message: "Planta não encontrada." });
    }

    if (planta.estoque < quantidade) {
      return res.status(400).json({
        message: `Estoque insuficiente. Temos só ${planta.estoque} vasos.`,
      });
    }

    // Se outra venda levou o estoque entre a checagem acima e aqui, count é 0 e nada muda
    const resultado = await PlantaRepository.decrementEstoque(id, quantidade);
    if (resultado.count === 0) {
      return res.status(400).json({ message: "Estoque insuficiente." });
    }

    const plantaAtualizada = await PlantaRepository.findPlantaById(id);

    return res.status(200).json(plantaAtualizada);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Erro ao registrar venda." });
  }
};

export const readPlantasEsgotadas = async (req: Request, res: Response) => {
  try {
    const plantas = await PlantaRepository.findPlantasEsgotadas();

    return res.status(200).json(plantas);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Erro ao buscar plantas esgotadas." });
  }
};

export const readValorTotalEstoque = async (req: Request, res: Response) => {
  try {
    const resumo = await PlantaRepository.getResumoEstoque();

    // Com a loja vazia, os dois valores são 0
    return res.status(200).json(resumo);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Erro ao calcular o valor do estoque." });
  }
};
