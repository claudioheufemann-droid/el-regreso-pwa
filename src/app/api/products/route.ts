import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const MOCK_PRODUCTS = [
  { id: "c1", name: "Arboretum", type: "CERVEZA", style: "Cerveza Artesanal", volumeMl: 473, ingredients: "Agua, Malta de Cebada, Lúpulo, Levadura", abv: 4.8, ibu: 22, phLevel: 4.2, tastingNotes: "Refrescante y equilibrada. Cerveza insignia con carácter propio de El Regreso.", dimensions: "15.7 x 6.6 cm", origin: "Valdivia, Chile", conservation: "Mantener refrigerado entre 2°C y 5°C", netPrice: 2000, grossPrice: 2380 },
  { id: "c2", name: "Descenso", type: "CERVEZA", style: "Cerveza Artesanal", volumeMl: 473, ingredients: "Agua, Malta Tostada, Lúpulo, Levadura", abv: null, ibu: null, phLevel: 4.3, tastingNotes: "Intensa y con cuerpo. Ideal para acompañar grandes momentos.", dimensions: null, origin: "Valdivia, Chile", conservation: "Mantener refrigerado entre 2°C y 5°C", netPrice: 2000, grossPrice: 2380 },
  { id: "c3", name: "Aguas Blancas", type: "CERVEZA", style: "Cerveza Artesanal", volumeMl: 473, ingredients: null, abv: 5.0, ibu: 25, phLevel: null, tastingNotes: "Ligera y cristalina, inspirada en las aguas del sur.", dimensions: "15.7 x 6.6 cm", origin: "Valdivia, Chile", conservation: null, netPrice: 2000, grossPrice: 2380 },
  { id: "k1", name: "Lemon", type: "KOMBUCHA", style: "Kombucha La Ida", volumeMl: 350, ingredients: "Agua, Cultivo, Té, Limón", abv: 0.5, ibu: null, phLevel: 3.2, tastingNotes: "Refrescante infusión fermentada.", dimensions: "12.2 x 5.8 cm", origin: "Valdivia, Chile", conservation: "Refrigerar", netPrice: 1500, grossPrice: 1785 },
];

export async function GET() {
  try {
    // REQUIRED PRISMA QUERY: Fetching FULL Product Object, no summaries
    const products = await prisma.product.findMany({
      select: {
        id: true,
        name: true,
        type: true,
        style: true,
        volumeMl: true,
        ingredients: true,
        abv: true,
        ibu: true,
        phLevel: true,
        tastingNotes: true,
        dimensions: true,
        origin: true,
        conservation: true,
        imageUrl: true,
        netPrice: true,
        grossPrice: true,
      }
    });

    if (products && products.length > 0) {
      return NextResponse.json(products);
    }
    
    // Fallback Mock si la DB está vacía
    return NextResponse.json(MOCK_PRODUCTS);
  } catch (error) {
    console.error("Prisma Error:", error);
    return NextResponse.json(MOCK_PRODUCTS);
  }
}
