import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Backend Logic: Calculate "Liters Remaining to Goal" for Carlos Urrejola
 * Specific Focus: High Volume Targets (Bar, Minimarket)
 */
export async function getCarlosUrrejolaProgress(weekPeriod: string, categoryFocus: "Bar" | "Minimarket") {
  // 1. Resolve Carlos's ID
  const carlos = await prisma.user.findFirst({
    where: { name: "Carlos Urrejola" } // Or look up by email
  });

  if (!carlos) throw new Error("Carlos Urrejola no encontrado en BD");

  // 2. Fetch specific target for the active week and category
  const target = await prisma.salesTarget.findFirst({
    where: {
      userId: carlos.id,
      timePeriod: weekPeriod, // e.g., "May-Week2"
      category: categoryFocus
    }
  });

  if (!target) return { error: "Meta no definida" };

  // 3. Aggregate all SUCCESSFUL visits by Carlos in that category for the week
  // For demonstration, we aggregate the orderItems from those visits
  // Assuming OrderItem volumeMl is captured or joined
  const successfulVisits = await prisma.visit.findMany({
    where: {
      userId: carlos.id,
      visitStatus: "SUCCESS",
      client: {
        preferredCategory: categoryFocus === "Bar" ? "CERVEZA" : "KOMBUCHA", 
        // Note: A more precise query would filter by the specific channel or client type 
        // stored in DB matching "Bar" or "Minimarket"
      },
      // date filtering for the week would be applied here
    },
    include: {
      order: {
        include: {
          items: {
            include: { product: true }
          }
        }
      }
    }
  });

  // Calculate Total Liters Sold
  let totalLitersSold = 0;
  successfulVisits.forEach(visit => {
    if (visit.order) {
      visit.order.items.forEach(item => {
        // volumeMl is in milliliters, convert to Liters
        const liters = (item.product.volumeMl / 1000) * item.quantity;
        totalLitersSold += liters;
      });
    }
  });

  // Calculate Remaining
  const remainingLiters = target.targetLiters - totalLitersSold;
  const percentage = (totalLitersSold / target.targetLiters) * 100;
  
  // High Volume Alert Logic (Mid-week rule)
  const currentDayOfWeek = new Date().getDay(); // 0: Sun, 3: Wed
  let alertTriggered = false;
  let promoSuggestion = null;

  // If below 80% (20% behind) of goal by Wednesday
  if (currentDayOfWeek >= 3 && percentage < 80) {
    alertTriggered = true;
    promoSuggestion = categoryFocus === "Bar" 
      ? "Ofrecer Barril 30L Descenso (Descuento Volumen)" 
      : "Display 24x Kombucha Natural (Envío Gratis)";
  }

  // Dynamic Commission Logic
  let estimatedCommission = 0;
  const baseRatePerLiter = 50; // $50 CLP per Liter
  
  if (percentage >= 80) {
    // Exponential increase once passing 80%
    const bonusMultiplier = 1 + ((percentage - 80) / 10); // +10% bonus for every 10% above 80%
    estimatedCommission = totalLitersSold * baseRatePerLiter * bonusMultiplier;
  } else {
    estimatedCommission = totalLitersSold * baseRatePerLiter;
  }

  return {
    vendorName: carlos.name,
    category: categoryFocus,
    targetLiters: target.targetLiters,
    litersSold: totalLitersSold,
    remainingLiters: remainingLiters > 0 ? remainingLiters : 0,
    percentage: percentage.toFixed(1),
    alert: alertTriggered,
    suggestedPitch: promoSuggestion,
    estimatedCommission: estimatedCommission
  };
}
