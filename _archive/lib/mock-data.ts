// Realistic French mock data for PROSPECTOR

export const MOCK_LEADS = [
  {
    id: "lead-1",
    firstName: "Marie",
    lastName: "Dubois",
    title: "CEO & Co-founder",
    company: "TechVision SAS",
    linkedinUrl: "https://linkedin.com/in/marie-dubois-techvision",
    email: "marie.dubois@techvision.fr",
    phone: "+33 6 12 34 56 78",
    score: 92,
    status: "hot" as const,
    stage: "responded" as const,
    tags: ["CEO", "SaaS", "Series A"],
    notes: "Très intéressée par JARVIS. Cherche à automatiser les process commerciaux. Budget validé en interne.",
    avatar: null,
    lastActivity: "2024-02-03T10:30:00",
    enrichmentData: {
      company: {
        size: "50-100 employés",
        industry: "SaaS / FinTech",
        funding: "Series A - 8M€ (2023)",
        revenue: "2-5M€ ARR",
        location: "Paris, France",
        website: "techvision.fr",
        description: "Solution de gestion financière pour PME",
      },
      person: {
        experience: [
          { title: "CEO & Co-founder", company: "TechVision SAS", startDate: "2020", endDate: null },
          { title: "VP Product", company: "Qonto", startDate: "2017", endDate: "2020" },
          { title: "Product Manager", company: "Doctolib", startDate: "2014", endDate: "2017" },
        ],
        education: [
          { school: "HEC Paris", degree: "Master", field: "Management" },
        ],
        interests: ["FinTech", "IA", "Scale-up", "Product Management"],
        recentPosts: [
          "Comment nous avons réduit notre churn de 40% grâce à l'automatisation",
          "Les 5 erreurs à éviter lors d'une levée Series A",
        ],
      },
    },
  },
  {
    id: "lead-2",
    firstName: "Thomas",
    lastName: "Martin",
    title: "CTO",
    company: "DataScale",
    linkedinUrl: "https://linkedin.com/in/thomas-martin-datascale",
    email: "t.martin@datascale.io",
    phone: "+33 6 98 76 54 32",
    score: 85,
    status: "hot" as const,
    stage: "in_sequence" as const,
    tags: ["CTO", "Data", "Scale-up"],
    notes: "Intéressé par l'aspect technique. Demande une démo approfondie.",
    avatar: null,
    lastActivity: "2024-02-02T14:15:00",
    enrichmentData: {
      company: {
        size: "100-200 employés",
        industry: "Data / Analytics",
        funding: "Series B - 25M€ (2023)",
        revenue: "10-15M€ ARR",
        location: "Lyon, France",
      },
      person: {
        experience: [
          { title: "CTO", company: "DataScale", startDate: "2019", endDate: null },
          { title: "Engineering Manager", company: "Datadog", startDate: "2016", endDate: "2019" },
        ],
        interests: ["Architecture", "DevOps", "IA/ML", "Open Source"],
      },
    },
  },
  {
    id: "lead-3",
    firstName: "Sophie",
    lastName: "Bernard",
    title: "Head of Operations",
    company: "GrowthLabs",
    linkedinUrl: "https://linkedin.com/in/sophie-bernard-growthlabs",
    email: "sophie@growthlabs.fr",
    score: 78,
    status: "warm" as const,
    stage: "connected" as const,
    tags: ["Operations", "Growth", "B2B"],
    notes: "Connectée récemment. À recontacter après son retour de vacances.",
    avatar: null,
    lastActivity: "2024-01-30T09:00:00",
    enrichmentData: {
      company: {
        size: "30-50 employés",
        industry: "Consulting / Growth",
        funding: "Bootstrapped",
        location: "Bordeaux, France",
      },
    },
  },
  {
    id: "lead-4",
    firstName: "Pierre",
    lastName: "Leroy",
    title: "VP Sales",
    company: "CloudFirst",
    linkedinUrl: "https://linkedin.com/in/pierre-leroy-cloudfirst",
    email: "pierre.leroy@cloudfirst.com",
    score: 72,
    status: "warm" as const,
    stage: "in_sequence" as const,
    tags: ["Sales", "Cloud", "Enterprise"],
    notes: "",
    avatar: null,
    lastActivity: "2024-02-01T16:45:00",
    enrichmentData: {
      company: {
        size: "200-500 employés",
        industry: "Cloud / Infrastructure",
        funding: "Series C - 50M€",
        location: "Paris, France",
      },
    },
  },
  {
    id: "lead-5",
    firstName: "Julie",
    lastName: "Moreau",
    title: "Directrice Marketing",
    company: "BrandBoost",
    linkedinUrl: "https://linkedin.com/in/julie-moreau-brandboost",
    email: "j.moreau@brandboost.fr",
    score: 65,
    status: "warm" as const,
    stage: "invited" as const,
    tags: ["Marketing", "Agence", "B2B"],
    notes: "Invitation acceptée hier. Préparer message de bienvenue.",
    avatar: null,
    lastActivity: "2024-02-02T11:20:00",
    enrichmentData: {
      company: {
        size: "20-30 employés",
        industry: "Marketing / Agence",
        location: "Nantes, France",
      },
    },
  },
  {
    id: "lead-6",
    firstName: "Nicolas",
    lastName: "Petit",
    title: "CEO",
    company: "InnovateTech",
    linkedinUrl: "https://linkedin.com/in/nicolas-petit-innovatetech",
    score: 58,
    status: "cold" as const,
    stage: "to_invite" as const,
    tags: ["CEO", "Startup", "IoT"],
    notes: "",
    avatar: null,
    lastActivity: null,
    enrichmentData: {
      company: {
        size: "10-20 employés",
        industry: "IoT / Hardware",
        funding: "Seed - 1.5M€",
        location: "Toulouse, France",
      },
    },
  },
  {
    id: "lead-7",
    firstName: "Camille",
    lastName: "Roux",
    title: "COO",
    company: "FastScale",
    linkedinUrl: "https://linkedin.com/in/camille-roux-fastscale",
    score: 45,
    status: "cold" as const,
    stage: "invited" as const,
    tags: ["Operations", "E-commerce"],
    notes: "Invitation envoyée il y a 5 jours, pas de réponse.",
    avatar: null,
    lastActivity: "2024-01-28T08:00:00",
    enrichmentData: {
      company: {
        size: "50-100 employés",
        industry: "E-commerce",
        location: "Lille, France",
      },
    },
  },
  {
    id: "lead-8",
    firstName: "Alexandre",
    lastName: "Girard",
    title: "Founder & CEO",
    company: "AIStartup",
    linkedinUrl: "https://linkedin.com/in/alexandre-girard-aistartup",
    score: 88,
    status: "hot" as const,
    stage: "meeting" as const,
    tags: ["CEO", "IA", "Startup"],
    notes: "RDV démo prévu le 05/02. Très motivé, cherche à équiper toute l'équipe commerciale.",
    avatar: null,
    lastActivity: "2024-02-03T09:15:00",
    enrichmentData: {
      company: {
        size: "15-25 employés",
        industry: "IA / ML",
        funding: "Seed - 3M€",
        location: "Paris, France",
      },
    },
  },
];

export const MOCK_ACTIONS = [
  {
    id: "action-1",
    leadId: "lead-1",
    actionType: "message" as const,
    status: "pending" as const,
    generatedMessage: `Bonjour Marie,

J'ai vu que TechVision a récemment bouclé sa Series A, félicitations ! 🎉

En discutant avec d'autres CEO de FinTech, j'ai remarqué que l'automatisation des process commerciaux devient critique à ce stade de croissance.

Comment gérez-vous actuellement le scaling de vos équipes sales ?`,
    scheduledAt: new Date().toISOString(),
    lead: MOCK_LEADS[0],
  },
  {
    id: "action-2",
    leadId: "lead-2",
    actionType: "message" as const,
    status: "pending" as const,
    generatedMessage: `Bonjour Thomas,

Merci d'avoir accepté ma demande de connexion !

J'ai vu votre article sur l'architecture data chez DataScale, très pertinent. Chez JARVIS, on aide les équipes tech à automatiser les tâches répétitives grâce à l'IA.

Seriez-vous ouvert à un échange de 15 minutes sur vos défis d'automatisation ?`,
    scheduledAt: new Date().toISOString(),
    lead: MOCK_LEADS[1],
  },
  {
    id: "action-3",
    leadId: "lead-3",
    actionType: "invitation" as const,
    status: "pending" as const,
    generatedMessage: `Sophie, votre expertise en ops chez GrowthLabs m'intéresse. J'aimerais échanger sur les défis d'automatisation dans les scale-ups B2B.`,
    scheduledAt: new Date().toISOString(),
    lead: MOCK_LEADS[2],
  },
  {
    id: "action-4",
    leadId: "lead-4",
    actionType: "visit" as const,
    status: "validated" as const,
    scheduledAt: new Date().toISOString(),
    lead: MOCK_LEADS[3],
  },
  {
    id: "action-5",
    leadId: "lead-5",
    actionType: "message" as const,
    status: "pending" as const,
    generatedMessage: `Bonjour Julie,

Merci pour la connexion ! J'ai vu que BrandBoost accompagne des clients B2B dans leur stratégie marketing.

Comment automatisez-vous actuellement vos processus de prospection pour vos clients ?`,
    scheduledAt: new Date().toISOString(),
    lead: MOCK_LEADS[4],
  },
  {
    id: "action-6",
    leadId: "lead-6",
    actionType: "invitation" as const,
    status: "pending" as const,
    generatedMessage: `Nicolas, votre parcours dans l'IoT est impressionnant. J'aimerais échanger sur comment l'IA peut aider InnovateTech à scaler.`,
    scheduledAt: new Date().toISOString(),
    lead: MOCK_LEADS[5],
  },
];

export const MOCK_SEQUENCES = [
  {
    id: "seq-1",
    name: "CEO Tech - Acquisition",
    persona: "CEO / Founder",
    status: "active" as const,
    stats: {
      totalLeads: 67,
      activeLeads: 42,
      completedLeads: 18,
      responseRate: 34,
      conversionRate: 12,
    },
    steps: [
      { id: "step-1", stepType: "visit" as const, delayDays: 0, stepOrder: 1 },
      { id: "step-2", stepType: "invitation" as const, delayDays: 1, template: "CEO Tech Invitation", stepOrder: 2 },
      { id: "step-3", stepType: "message" as const, delayDays: 2, template: "Message bienvenue CEO", stepOrder: 3 },
      { id: "step-4", stepType: "message" as const, delayDays: 5, template: "Relance valeur CEO", stepOrder: 4 },
      { id: "step-5", stepType: "message" as const, delayDays: 7, template: "Proposition call CEO", stepOrder: 5 },
    ],
  },
  {
    id: "seq-2",
    name: "CTO SaaS - Technique",
    persona: "CTO / VP Engineering",
    status: "active" as const,
    stats: {
      totalLeads: 45,
      activeLeads: 28,
      completedLeads: 12,
      responseRate: 28,
      conversionRate: 8,
    },
    steps: [
      { id: "step-6", stepType: "visit" as const, delayDays: 0, stepOrder: 1 },
      { id: "step-7", stepType: "invitation" as const, delayDays: 1, template: "CTO Invitation technique", stepOrder: 2 },
      { id: "step-8", stepType: "message" as const, delayDays: 3, template: "Message technique CTO", stepOrder: 3 },
      { id: "step-9", stepType: "message" as const, delayDays: 6, template: "Case study technique", stepOrder: 4 },
    ],
  },
  {
    id: "seq-3",
    name: "Head of Ops - Process",
    persona: "COO / Head of Operations",
    status: "paused" as const,
    stats: {
      totalLeads: 32,
      activeLeads: 0,
      completedLeads: 25,
      responseRate: 22,
      conversionRate: 6,
    },
    steps: [
      { id: "step-10", stepType: "invitation" as const, delayDays: 0, template: "Ops Invitation", stepOrder: 1 },
      { id: "step-11", stepType: "message" as const, delayDays: 2, template: "Message process Ops", stepOrder: 2 },
      { id: "step-12", stepType: "message" as const, delayDays: 5, template: "ROI Ops", stepOrder: 3 },
    ],
  },
];

export const MOCK_CONVERSATIONS = [
  {
    id: "conv-1",
    leadId: "lead-1",
    leadName: "Marie Dubois",
    leadTitle: "CEO @ TechVision SAS",
    channel: "linkedin",
    status: "unread" as const,
    messages: [
      {
        id: "msg-1",
        direction: "outbound" as const,
        content: "Bonjour Marie, j'ai vu que TechVision a récemment bouclé sa Series A...",
        timestamp: "2024-02-01T10:00:00",
      },
      {
        id: "msg-2",
        direction: "inbound" as const,
        content: "Bonjour ! Merci pour votre message. Effectivement, nous cherchons actuellement à optimiser nos process commerciaux. Comment JARVIS pourrait nous aider concrètement ?",
        timestamp: "2024-02-02T14:30:00",
      },
    ],
    lastMessage: "Bonjour ! Merci pour votre message. Effectivement, nous cherchons actuellement à optimiser nos process commerciaux.",
    timestamp: "Il y a 2h",
  },
  {
    id: "conv-2",
    leadId: "lead-8",
    leadName: "Alexandre Girard",
    leadTitle: "Founder & CEO @ AIStartup",
    channel: "linkedin",
    status: "unread" as const,
    messages: [
      {
        id: "msg-3",
        direction: "outbound" as const,
        content: "Alexandre, votre approche de l'IA appliquée au B2B m'intéresse beaucoup...",
        timestamp: "2024-02-01T09:00:00",
      },
      {
        id: "msg-4",
        direction: "inbound" as const,
        content: "Avec plaisir pour un call ! Je suis dispo jeudi 15h ou vendredi matin. Qu'est-ce qui vous arrange ?",
        timestamp: "2024-02-03T09:15:00",
      },
    ],
    lastMessage: "Avec plaisir pour un call ! Je suis dispo jeudi 15h ou vendredi matin.",
    timestamp: "Il y a 30min",
  },
  {
    id: "conv-3",
    leadId: "lead-2",
    leadName: "Thomas Martin",
    leadTitle: "CTO @ DataScale",
    channel: "linkedin",
    status: "read" as const,
    messages: [
      {
        id: "msg-5",
        direction: "outbound" as const,
        content: "Thomas, j'ai lu votre article sur l'architecture data...",
        timestamp: "2024-01-30T11:00:00",
      },
      {
        id: "msg-6",
        direction: "inbound" as const,
        content: "Merci ! Oui l'automatisation est un sujet qui nous intéresse. Vous avez de la doc technique sur JARVIS ?",
        timestamp: "2024-01-31T16:00:00",
      },
      {
        id: "msg-7",
        direction: "outbound" as const,
        content: "Bien sûr ! Je vous envoie notre documentation technique et quelques cas d'usage...",
        timestamp: "2024-02-01T09:30:00",
      },
    ],
    lastMessage: "Bien sûr ! Je vous envoie notre documentation technique...",
    timestamp: "Hier",
  },
];

export const MOCK_TEAM = [
  {
    id: "user-1",
    name: "Khalil",
    email: "khalil@jarvis.ai",
    initials: "KH",
    role: "Admin",
    stats: {
      actionsThisWeek: 52,
      responseRate: 34,
      leadsAdded: 35,
      meetings: 4,
      messagessSent: 145,
    },
  },
  {
    id: "user-2",
    name: "Lucas Mercier",
    email: "lucas@jarvis.ai",
    initials: "LM",
    role: "User",
    stats: {
      actionsThisWeek: 45,
      responseRate: 28,
      leadsAdded: 28,
      meetings: 3,
      messagessSent: 120,
    },
  },
  {
    id: "user-3",
    name: "Emma Faure",
    email: "emma@jarvis.ai",
    initials: "EF",
    role: "User",
    stats: {
      actionsThisWeek: 48,
      responseRate: 31,
      leadsAdded: 32,
      meetings: 5,
      messagessSent: 135,
    },
  },
];

export const MOCK_STATS = {
  today: {
    actionsTotal: 15,
    actionsPending: 8,
    actionsValidated: 5,
    actionsSent: 2,
  },
  quotas: {
    invitations: { used: 8, limit: 15 },
    messages: { used: 23, limit: 50 },
    visits: { used: 12, limit: 30 },
  },
  responseRate: {
    week: 32,
    month: 28,
    trend: [18, 22, 25, 28, 30, 32, 28, 35, 32],
  },
  pipeline: {
    stages: [
      { name: "À inviter", count: 45, color: "#94a3b8" },
      { name: "Invité", count: 38, color: "#60a5fa" },
      { name: "Connecté", count: 28, color: "#34d399" },
      { name: "En séquence", count: 22, color: "#fbbf24" },
      { name: "A répondu", count: 15, color: "#f97316" },
      { name: "RDV", count: 8, color: "#ef4444" },
    ],
  },
  hotLeads: MOCK_LEADS.filter((l) => l.score >= 70).slice(0, 5),
  unreadResponses: 3,
};

export const LEAD_HISTORY_MOCK = [
  {
    id: "hist-1",
    type: "visit" as const,
    date: "2024-01-25T10:00:00",
    description: "Visite du profil LinkedIn",
  },
  {
    id: "hist-2",
    type: "invitation" as const,
    date: "2024-01-26T09:30:00",
    description: "Invitation envoyée",
    message: "Marie, votre parcours chez TechVision m'intéresse...",
  },
  {
    id: "hist-3",
    type: "invitation_accepted" as const,
    date: "2024-01-27T14:00:00",
    description: "Invitation acceptée",
  },
  {
    id: "hist-4",
    type: "message" as const,
    date: "2024-01-28T10:15:00",
    description: "Message envoyé",
    message: "Bonjour Marie, merci d'avoir accepté ma demande...",
  },
  {
    id: "hist-5",
    type: "response" as const,
    date: "2024-01-29T16:45:00",
    description: "Réponse reçue",
    message: "Bonjour ! Merci pour votre message. Effectivement...",
  },
  {
    id: "hist-6",
    type: "message" as const,
    date: "2024-01-30T09:00:00",
    description: "Réponse envoyée",
    message: "Super ! Je vous propose un call de 15 minutes...",
  },
  {
    id: "hist-7",
    type: "note" as const,
    date: "2024-02-01T11:00:00",
    description: "Note ajoutée",
    message: "Lead très qualifié, budget validé en interne.",
  },
];
