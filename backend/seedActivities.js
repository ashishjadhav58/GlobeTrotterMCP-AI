require('dotenv').config();
const prisma = require('./utils/prisma');

const SAMPLE_ACTIVITIES = [
  // Paris Activities
  {
    title: "Eiffel Tower Summit Priority Access",
    description: "Enjoy panoramic views of Paris from the 3rd floor summit with exclusive priority elevator access.",
    category: "Sightseeing",
    costType: "$$",
    costAmount: 45.0,
    duration: "1-2 Hours",
    rating: 4.9,
    popularity: 98,
    image: "https://images.unsplash.com/photo-1511739001486-6bfe10ce785f?auto=format&fit=crop&w=600&q=80",
    cityName: "Paris",
  },
  {
    title: "Louvre Museum Guided Masterpiece Tour",
    description: "Discover the Mona Lisa, Venus de Milo, and Winged Victory with an expert art historian.",
    category: "Culture",
    costType: "$$",
    costAmount: 65.0,
    duration: "Half Day",
    rating: 4.8,
    popularity: 95,
    image: "https://images.unsplash.com/photo-1499856871958-5b9627545d1a?auto=format&fit=crop&w=600&q=80",
    cityName: "Paris",
  },
  {
    title: "Seine River Sunset Dinner Cruise",
    description: "Savor a 3-course French gourmet meal while drifting past illuminated Parisian monuments.",
    category: "Food & Dining",
    costType: "$$$",
    costAmount: 110.0,
    duration: "1-2 Hours",
    rating: 4.7,
    popularity: 92,
    image: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=600&q=80",
    cityName: "Paris",
  },
  {
    title: "Montmartre Pastry & Bakery Walk",
    description: "Sample fresh croissants, macarons, and artisanal cheeses in bohemian Montmartre.",
    category: "Food & Dining",
    costType: "$",
    costAmount: 30.0,
    duration: "1-2 Hours",
    rating: 4.9,
    popularity: 88,
    image: "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=600&q=80",
    cityName: "Paris",
  },

  // Tokyo Activities
  {
    title: "Tokyo Tsukiji Outer Market Food Tasting",
    description: "Taste fresh sushi, wagyu beef skewers, tamagoyaki, and matcha with a local guide.",
    category: "Food & Dining",
    costType: "$$",
    costAmount: 50.0,
    duration: "Half Day",
    rating: 4.9,
    popularity: 96,
    image: "https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&w=600&q=80",
    cityName: "Tokyo",
  },
  {
    title: "Shibuya Skydeck & Crossing Tour",
    description: "Experience 360-degree views of Tokyo from Shibuya Sky rooftop followed by the famous scramble crossing.",
    category: "Sightseeing",
    costType: "$",
    costAmount: 18.0,
    duration: "1-2 Hours",
    rating: 4.8,
    popularity: 94,
    image: "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&w=600&q=80",
    cityName: "Tokyo",
  },
  {
    title: "TeamLab Planets Digital Art Museum",
    description: "Immerse your senses in body-immersive digital artwork rooms and water installations.",
    category: "Culture",
    costType: "$$",
    costAmount: 38.0,
    duration: "1-2 Hours",
    rating: 4.9,
    popularity: 97,
    image: "https://images.unsplash.com/photo-1536098561742-ca998e48cbcc?auto=format&fit=crop&w=600&q=80",
    cityName: "Tokyo",
  },

  // Rome Activities
  {
    title: "Colosseum & Roman Forum Underground Tour",
    description: "Step onto the arena floor and walk through underground gladiatorial chambers.",
    category: "Culture",
    costType: "$$",
    costAmount: 55.0,
    duration: "Half Day",
    rating: 4.9,
    popularity: 99,
    image: "https://images.unsplash.com/photo-1552832230-c0197dd311b5?auto=format&fit=crop&w=600&q=80",
    cityName: "Rome",
  },
  {
    title: "Trastevere Authentic Gelato & Pizza Masterclass",
    description: "Handcraft Roman pizza dough and authentic artisanal gelato from scratch.",
    category: "Food & Dining",
    costType: "$$",
    costAmount: 48.0,
    duration: "Half Day",
    rating: 4.8,
    popularity: 91,
    image: "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=600&q=80",
    cityName: "Rome",
  },

  // Zurich / Alps Activities
  {
    title: "Swiss Alps & Jungfraujoch Top of Europe Train",
    description: "Ascend 3,454 meters to the highest railway station in Europe with breathtaking glacier views.",
    category: "Adventure",
    costType: "$$$",
    costAmount: 195.0,
    duration: "Full Day",
    rating: 4.95,
    popularity: 96,
    image: "https://images.unsplash.com/photo-1530122037265-a5f1f91d3b99?auto=format&fit=crop&w=600&q=80",
    cityName: "Zurich",
  },
  {
    title: "Lake Zurich Scenic Boat Cruise & Lindt Chocolate",
    description: "Cruise peaceful alpine waters followed by a chocolate fountain tour at Lindt Home of Chocolate.",
    category: "Relaxation",
    costType: "$",
    costAmount: 25.0,
    duration: "Half Day",
    rating: 4.8,
    popularity: 89,
    image: "https://images.unsplash.com/photo-1527668752968-14dc70a27c95?auto=format&fit=crop&w=600&q=80",
    cityName: "Zurich",
  },
];

async function seed() {
  console.log("Seeding activities into database...");
  for (const act of SAMPLE_ACTIVITIES) {
    const existing = await prisma.activity.findFirst({
      where: { title: act.title },
    });
    if (!existing) {
      // Find matching city ID if exists
      const city = await prisma.city.findFirst({
        where: { name: { equals: act.cityName, mode: "insensitive" } },
      });
      await prisma.activity.create({
        data: {
          title: act.title,
          description: act.description,
          category: act.category,
          costType: act.costType,
          costAmount: act.costAmount,
          duration: act.duration,
          rating: act.rating,
          popularity: act.popularity,
          image: act.image,
          cityName: act.cityName,
          cityId: city ? city.id : null,
        },
      });
    }
  }
  console.log("Activity seeding completed successfully!");
}

seed()
  .catch((err) => console.error("Activity seed error:", err))
  .finally(() => prisma.$disconnect());
