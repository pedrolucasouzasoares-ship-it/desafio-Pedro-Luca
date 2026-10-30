import { Luminosidade, Prisma } from "@prisma/client";
import prisma from "@database";

export type PlantaFilters = {
  luminosidade?: Luminosidade;
  petFriendly?: boolean;
  nome?: string;
  ordem?: "preco" | "nome";
};

export const createPlanta = async (data: Prisma.PlantaCreateInput) => {
  return await prisma.planta.create({
    data: data,
  });
};

export const findAllPlantas = async (filters: PlantaFilters) => {
  const orderBy: Prisma.PlantaOrderByWithRelationInput =
    filters.ordem === "preco"
      ? { preco: "asc" }
      : filters.ordem === "nome"
        ? { nome: "asc" }
        : { id: "asc" };

  // Condições com valor undefined são ignoradas pelo Prisma,
  // então uma única consulta atende todas as combinações de filtros.
  return await prisma.planta.findMany({
    where: {
      luminosidade: filters.luminosidade,
      petFriendly: filters.petFriendly,
      nome: filters.nome
        ? { contains: filters.nome, mode: "insensitive" }
        : undefined,
    },
    orderBy: orderBy,
  });
};

export const findPlantaById = async (id: number) => {
  return await prisma.planta.findUnique({
    where: { id: id },
  });
};

export const updatePlanta = async (id: number, data: Prisma.PlantaUpdateInput) => {
  return await prisma.planta.update({
    where: { id: id },
    data: data,
  });
};

export const deletePlanta = async (id: number) => {
  return await prisma.planta.delete({
    where: { id: id },
  });
};

// Diminui o estoque só se ainda houver vasos suficientes. A checagem e a
// subtração acontecem no mesmo comando SQL, então duas compras simultâneas
// do último vaso nunca deixam o estoque negativo. Devolve { count }:
// 1 se vendeu, 0 se não havia estoque suficiente.
export const decrementEstoque = async (id: number, quantidade: number) => {
  return await prisma.planta.updateMany({
    where: { id: id, estoque: { gte: quantidade } },
    data: { estoque: { decrement: quantidade } },
  });
};

export const findPlantasEsgotadas = async () => {
  return await prisma.planta.findMany({
    where: { estoque: 0 },
    orderBy: { id: "asc" },
  });
};

// O aggregate do Prisma não multiplica colunas, então buscamos só
// preco e estoque e fazemos a conta aqui.
export const getResumoEstoque = async () => {
  const plantas = await prisma.planta.findMany({
    select: { preco: true, estoque: true },
  });

  let valorTotalEmCentavos = 0;
  let totalDeVasos = 0;

  for (const planta of plantas) {
    valorTotalEmCentavos += planta.preco * planta.estoque;
    totalDeVasos += planta.estoque;
  }

  return { valorTotalEmCentavos, totalDeVasos };
};
