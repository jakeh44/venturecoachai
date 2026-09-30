/**
 * The 17-question founder intake.
 *
 * Slugs and question text are the EXACT values from
 * /home/team/shared/PRODUCT-CONSTANTS.md §2 — they are the keys the coach
 * engine reads (`deriveFacts` in coach/intake.ts maps them to BusinessFacts)
 * and the keys stored in `founder_profiles.answers`, so they must not drift.
 *
 * `hint`, `placeholder` and `choices` are presentation aids added for the
 * wizard; they are not part of the constants.
 *
 * Pure data — safe to import from the client wizard.
 */

export interface OnboardingQuestion {
  slug: string;
  question: string;
  hint: string;
  placeholder: string;
  kind: "text" | "textarea" | "choice" | "number";
  choices?: string[];
  /** Question 1 is the founder's name; the rest describe the business. */
  about: "founder" | "business";
}

export const ONBOARDING_QUESTIONS: OnboardingQuestion[] = [
  {
    slug: "name",
    question: "What is your name?",
    hint: "The coach addresses you by first name.",
    placeholder: "Ada Founder",
    kind: "text",
    about: "founder",
  },
  {
    slug: "occupation",
    question: "What is your current occupation?",
    hint: "Your day job matters: it tells the coach how much time and cash you have.",
    placeholder: "Marketing manager at a software company",
    kind: "text",
    about: "founder",
  },
  {
    slug: "experience",
    question: "How much business experience do you have?",
    hint: "Answer honestly — first-time founders get a different plan.",
    placeholder: "Pick one",
    kind: "choice",
    choices: [
      "None — this is my first business",
      "Less than 2 years",
      "2–5 years",
      "5–10 years",
      "10+ years",
    ],
    about: "founder",
  },
  {
    slug: "current_business",
    question: "Do you have a current business? Describe it.",
    hint: "Revenue, customers, what you sell. Write “No current business” if you have not started.",
    placeholder: "No current business — I have an idea I have not started",
    kind: "textarea",
    about: "business",
  },
  {
    slug: "business_idea",
    question: "What is your business idea?",
    hint: "One or two sentences: what you sell, to whom, and what changes for them.",
    placeholder: "I help clinic owners digitise patient intake so they stop wasting hours on admin",
    kind: "textarea",
    about: "business",
  },
  {
    slug: "target_customer",
    question: "Who is your target customer?",
    hint: "Be specific — a role, a situation and the pain they already pay to fix.",
    placeholder: "Small physiotherapy clinic owners with 2–5 staff",
    kind: "text",
    about: "business",
  },
  {
    slug: "current_revenue",
    question: "What is your current revenue?",
    hint: "Monthly figure if you have one. “No revenue yet” is a valid, useful answer.",
    placeholder: "$0 — pre-revenue",
    kind: "text",
    about: "business",
  },
  {
    slug: "income_goal",
    question: "What is your monthly income goal?",
    hint: "The number that would make this worthwhile for you.",
    placeholder: "$8,000/month",
    kind: "text",
    about: "founder",
  },
  {
    slug: "startup_capital",
    question: "How much startup capital do you have available?",
    hint: "Cash you could lose without changing your life.",
    placeholder: "$3,000",
    kind: "text",
    about: "founder",
  },
  {
    slug: "hours_per_week",
    question: "How many hours per week can you dedicate?",
    hint: "The honest number, not the ideal one — it caps every plan the coach makes.",
    placeholder: "Pick one",
    kind: "choice",
    choices: ["Up to 5 hours/week", "10 hours/week", "20 hours/week", "30 hours/week", "40+ hours/week (full time)"],
    about: "founder",
  },
  {
    slug: "timeline",
    question: "What is your desired timeline?",
    hint: "When do you want this to be making money?",
    placeholder: "Pick one",
    kind: "choice",
    choices: ["Within 3 months", "3–6 months", "6–12 months", "1–2 years", "No fixed timeline"],
    about: "founder",
  },
  {
    slug: "skills",
    question: "What skills do you have?",
    hint: "Sales, delivery, technical, operational — anything you can already do well.",
    placeholder: "Copywriting, paid ads, spreadsheet modelling",
    kind: "textarea",
    about: "founder",
  },
  {
    slug: "network_resources",
    question: "What network or resources do you have?",
    hint: "Who you can reach, what you already own, who owes you a favour.",
    placeholder: "40 clinic owners in my city, one accountant friend, a spare 10 hours a week",
    kind: "textarea",
    about: "founder",
  },
  {
    slug: "biggest_obstacle",
    question: "What is your biggest obstacle?",
    hint: "Your own words — the coach compares this against the objective constraint.",
    placeholder: "I don't know how to get the first paying customer",
    kind: "textarea",
    about: "business",
  },
  {
    slug: "risk_tolerance",
    question: "What is your risk tolerance?",
    hint: "How much uncertainty you can carry while this gets built.",
    placeholder: "Pick one",
    kind: "choice",
    choices: ["Low — I need safety", "Medium — I can invest some savings", "High — I can go all in"],
    about: "founder",
  },
  {
    slug: "business_model",
    question: "What business model do you prefer?",
    hint: "How money comes in. Include a price if you already have one.",
    placeholder: "Monthly subscription, $99 per clinic",
    kind: "text",
    about: "business",
  },
  {
    slug: "ambition",
    question: "Do you want a lifestyle business, high-growth company, or eventual acquisition/exit?",
    hint: "This changes what the coach optimises for at every stage.",
    placeholder: "Pick one",
    kind: "choice",
    choices: [
      "Lifestyle business — good income, controlled size",
      "High-growth company — hire, raise, expand fast",
      "Eventual acquisition or exit",
      "Not sure yet",
    ],
    about: "founder",
  },
];

export const ONBOARDING_SLUGS = ONBOARDING_QUESTIONS.map((question) => question.slug);

export function isOnboardingSlug(value: unknown): value is string {
  return typeof value === "string" && ONBOARDING_SLUGS.includes(value);
}

/** Question labels for the known/assumed/unknown split and review screens. */
export function questionFor(slug: string): OnboardingQuestion | undefined {
  return ONBOARDING_QUESTIONS.find((question) => question.slug === slug);
}
