require('dotenv').config();
const prisma = require('./utils/prisma');

const SAMPLE_POSTS = [
  {
    title: "Hidden Gem Cafes & Sunset Views in Montmartre, Paris",
    content: "Just spent 5 unforgettable days exploring Paris. Beyond the Eiffel Tower, the secret is waking up at 7 AM in Montmartre to grab fresh almond croissants at Le Grenier à Pain before the crowd arrives. The view from the steps of Sacré-Cœur at twilight is unmatched!",
    location: "Paris, France",
    region: "Europe",
    category: "Travel Story",
    image: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=800&q=80",
    likesCount: 142,
    authorName: "Alex Riviera",
  },
  {
    title: "Complete 4-Day Itinerary for Tokyo Street Food & Temples",
    content: "If you're visiting Tokyo for the first time, don't miss Tsukiji Outer Market for breakfast. The tamagoyaki egg skewers for 150 JPY and fresh tuna bowls are legendary! Tip: get a Suica card for seamless subway transit.",
    location: "Tokyo, Japan",
    region: "Asia",
    category: "Itinerary & Tips",
    image: "https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&w=800&q=80",
    likesCount: 289,
    authorName: "Sophia Chen",
  },
  {
    title: "Hiking the Swiss Alps: Grindelwald to First Cliff Walk",
    content: "Breathtaking mountain air and alpine meadows! We hiked from Grindelwald to Bachalpsee Lake. The reflection of the snow-capped peaks on the crystal-clear water was one of the most serene moments of my life.",
    location: "Zurich & Alps, Switzerland",
    region: "Europe",
    category: "Adventure",
    image: "https://images.unsplash.com/photo-1530122037265-a5f1f91d3b99?auto=format&fit=crop&w=800&q=80",
    likesCount: 198,
    authorName: "Marcus Vance",
  },
  {
    title: "Colosseum Underground Night Tour Experience in Rome",
    content: "Booking the night tour for the Colosseum was the best decision of our Italy trip. No daytime heat, minimal crowds, and walking through the subterranean chambers under dramatic floodlights felt magical.",
    location: "Rome, Italy",
    region: "Europe",
    category: "Culture & History",
    image: "https://images.unsplash.com/photo-1552832230-c0197dd311b5?auto=format&fit=crop&w=800&q=80",
    likesCount: 167,
    authorName: "Elena Rostova",
  },
];

async function seed() {
  console.log("Seeding community posts into database...");
  const user = await prisma.user.findFirst();
  if (!user) {
    console.log("No user found for seeding community posts.");
    return;
  }

  for (const post of SAMPLE_POSTS) {
    const existing = await prisma.communityPost.findFirst({
      where: { title: post.title },
    });

    if (!existing) {
      const createdPost = await prisma.communityPost.create({
        data: {
          userId: user.id,
          authorName: post.authorName,
          title: post.title,
          content: post.content,
          location: post.location,
          region: post.region,
          category: post.category,
          image: post.image,
          likesCount: post.likesCount,
        },
      });

      // Add sample comment
      await prisma.postComment.create({
        data: {
          postId: createdPost.id,
          authorName: "Traveler_Sam",
          content: "Incredible story! Saving this to my itinerary wishlist.",
        },
      });
    }
  }
  console.log("Community posts seeding completed!");
}

seed()
  .catch((err) => console.error("Community seed error:", err))
  .finally(() => prisma.$disconnect());
