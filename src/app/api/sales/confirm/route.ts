import { NextResponse } from "next/server";

// Simulación de Prisma DB
// import { PrismaClient } from "@prisma/client";
// const prisma = new PrismaClient();

// Simulación de Resend
// import { Resend } from 'resend';
// const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { clientType, clientName, totalAmount, email, cartItems } = body;

    /* 
      1. TRANSACCIÓN ATÓMICA DE PRISMA 
      Esto asegura que si falla el correo, no se sume la meta, evitando descuadres financieros.
    */
    /*
    await prisma.$transaction(async (tx) => {
      // Registrar log
      await tx.transactionLog.create({
        data: { userId: "mock-session", clientName, clientType, totalAmount, status: "SUCCESS" }
      });
      // Actualizar Performance
      await tx.salesPerformance.update({ ... });
    });
    */

    console.log(`[DB Transaction] Venta atómica completada: ${clientName} - $${totalAmount}`);
    console.log(`[KPI Engine] Actualizadas metas (Nuevos/Existentes) según cliente: ${clientType}`);

    /* 
      2. ENVÍO DE EMAIL TRANSACCIONAL (Resend / SendGrid)
      Operación asíncrona no bloqueante.
    */
    console.log(`[Resend API] Enviando comprobante a: ${email || "cliente@mock.com"} | CC: vendedor@elregreso.cl`);
    
    // Retornamos los datos para gamificación en el frontend
    return NextResponse.json({
      success: true,
      message: "Transacción confirmada",
      performance: {
        dailyGoal: 100000,
        dailyCurrent: 45000 + totalAmount,
        weeklyGoal: 500000,
        weeklyCurrent: 320000 + totalAmount,
        monthlyGoal: 2000000,
        monthlyCurrent: 1400000 + totalAmount,
      }
    });

  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false, error: "Transaction Failed" }, { status: 500 });
  }
}
