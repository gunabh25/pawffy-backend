const prisma = require("../config/prisma");
const asyncHandler = require("../middleware/asyncHandler");

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  const Stripe = require("stripe");
  return Stripe(process.env.STRIPE_SECRET_KEY);
}

exports.createCheckoutSession = asyncHandler(async (req, res) => {
  const { bookingId } = req.body;

  if (!bookingId) {
    return res.status(400).json({ success: false, message: "bookingId is required" });
  }

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { vet: true, pet: true },
  });

  if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });
  if (booking.userId !== req.user.id) {
    return res.status(403).json({ success: false, message: "Access denied" });
  }

  const amount = booking.vet?.consultationFee
    ? Number(booking.vet.consultationFee)
    : 500;

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    customer_email: req.user.email,
    line_items: [
      {
        price_data: {
          currency: "inr",
          product_data: {
            name: `Pawffy – ${booking.bookingType} booking`,
            description: `Pet: ${booking.pet.name} | Date: ${booking.bookingDate.toDateString()}`,
          },
          unit_amount: Math.round(amount * 100),
        },
        quantity: 1,
      },
    ],
    success_url: `${process.env.FRONTEND_URL || "http://localhost:3000"}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.FRONTEND_URL || "http://localhost:3000"}/payment-cancelled`,
    metadata: { bookingId },
  });

  await prisma.payment.upsert({
    where: { bookingId },
    update: { transactionId: session.id, paymentStatus: "pending" },
    create: {
      bookingId,
      amount,
      paymentMethod: "stripe",
      paymentStatus: "pending",
      transactionId: session.id,
    },
  });

  res.json({ success: true, data: { url: session.url, sessionId: session.id } });
});

exports.handleWebhook = async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook signature failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const bookingId = session.metadata?.bookingId;

    if (bookingId) {
      await prisma.payment.updateMany({
        where: { transactionId: session.id },
        data: { paymentStatus: "paid", paidAt: new Date() },
      });
      await prisma.booking.update({
        where: { id: bookingId },
        data: { status: "confirmed" },
      });
    }
  }

  res.json({ received: true });
};

exports.getPaymentByBooking = asyncHandler(async (req, res) => {
  const payment = await prisma.payment.findUnique({
    where: { bookingId: req.params.bookingId },
    include: { booking: { select: { bookingType: true, bookingDate: true } } },
  });

  if (!payment) return res.status(404).json({ success: false, message: "Payment not found" });
  res.json({ success: true, data: payment });
});
