export const summary =
  "Senior frontend engineer with 9+ years delivering scalable React, TypeScript, Vue, and Node.js applications across healthcare, financial services, government contractors, and consumer environments. Experienced in GraphQL and REST integration, reusable component architecture, performance optimization, mentoring, and AI-assisted development, with a strong focus on testing, privacy, accessibility, and code quality.";

export const education = [
  {
    school: "Seattle University",
    detail: "Software Engineering coursework — PostgreSQL, Java, Spring Boot, Microservices",
    note: "GPA 3.8",
  },
  {
    school: "West Virginia University",
    detail: "Business Management, Communication, Project Management",
    note: "GPA 3.8",
  },
  {
    school: "Training",
    detail:
      "General Assembly: Web Development, JavaScript, Ruby · Coursera: Cloud Native, C#, Python, Azure, AWS",
    note: "",
  },
] as const;

export const experience = [
  {
    role: "Frontend Engineer",
    org: "TEGINC",
    context: "Public Safety Applications · Remote",
    dates: "Jan 2023 — Aug 2026",
    points: [
      "Developed reusable React components on a four-person Agile team, improving usability, privacy, and online/offline reliability; introduced Storybook to isolate legacy components, uncover defects, and strengthen component testing.",
      "Partnered with C# backend engineers to validate integrations and testing, troubleshoot defects, translate stakeholder needs into Jira tickets, and present work in recurring reviews.",
      "Designed an interactive case-network visualization that organized criminal cases by severity, helping law-enforcement users prioritize investigations and contributing to a significant reduction in injuries during arrests.",
      "Used Datadog to identify and eliminate memory leaks and server-side defects, improving site performance by 90%; implemented form caching to support reliable offline field submissions.",
    ],
  },
  {
    role: "Full-Stack Engineer",
    org: "Path",
    context: "Digital Asset Banking Platform · Remote",
    dates: "Feb 2022 — Dec 2022",
    points: [
      "Built and upgraded Vue and TypeScript components on a 12-person Agile team; troubleshot environment and implementation issues and helped lead team setup and debugging.",
      "Designed GraphQL schemas and data integrations, conducted peer code reviews, and mentored multiple engineers through technical guidance and hands-on training.",
      "Moved to a two-person backend team to build, test, document, and maintain NestJS REST APIs using Redis and Prisma; supported React consumers with debugging, bug fixes, and integration guidance.",
    ],
  },
  {
    role: "Applications Engineer",
    org: "RedZone",
    context: "Government Sewer Robotics Platform · Remote",
    dates: "Aug 2021 — Jan 2022",
    points: [
      "Built React Hooks and Vue features on a six-person Agile team, focusing on frontend delivery, deployment, API integration, and cross-device usability.",
      "Created the company's first cross-device PWA using React, local storage, REST APIs, Azure, C#, and PostgreSQL; added coverage with React Testing Library and demonstrated releases to stakeholders.",
      "Built a control interface for sewer-inspection robots that helped operators detect infrastructure issues, navigate around animals and other obstacles, and automatically generate initial work orders from deployment findings.",
    ],
  },
  {
    role: "Applications Engineer",
    org: "MultiCare",
    context: "Multi-Hospital Healthcare System · Tacoma, WA",
    dates: "Jun 2019 — Mar 2021",
    points: [
      "Delivered React and TypeScript information-sharing tools for healthcare teams across multiple Pacific Northwest hospitals on a three-person Agile team.",
      "Integrated Python, Java/Spring Boot, PostgreSQL, MongoDB, and PHP services; configured AWS and Google Cloud solutions and supported MVP releases, client requirements, training, and adoption.",
    ],
  },
  {
    role: "Full-Stack Developer / Lead UX Designer",
    org: "Fonte Coffee Roaster",
    context: "Seattle, WA",
    dates: "Feb 2018 — Feb 2019",
    points: [
      "Designed, built, tested, and deployed fontecoffee.com using Node.js, React, SASS, Jest, GitLab, and AWS while leading UX design and frontend development in sprints.",
      "Helped increase retail profit by 24%, grow organic traffic by 19%, and reduce overhead by 30% while integrating YRC shipping and streamlining ShipStation workflows.",
    ],
  },
] as const;

export const stack = [
  {
    label: "Frontend",
    items: [
      "React", "React Native", "Redux", "TypeScript", "JavaScript", "Vue",
      "Next.js", "SSR/SSG", "SASS", "PWA", "Storybook", "Chromatic", "A11y",
    ],
  },
  {
    label: "APIs, Backend & Data",
    items: [
      "GraphQL", "REST APIs", "Node.js", "NestJS", "Redis", "Prisma", "C#",
      "Python", "Java", "Spring Boot", "PHP", "PostgreSQL", "MongoDB", "SQL",
    ],
  },
  {
    label: "Cloud, Quality & Delivery",
    items: [
      "AWS", "Azure", "Google Cloud", "Docker", "Jest", "React Testing Library",
      "GitHub/GitLab", "Jira", "CI/CD", "Figma", "Adobe XD", "Contentful",
      "Datadog", "New Relic", "AI-assisted development",
    ],
  },
] as const;
