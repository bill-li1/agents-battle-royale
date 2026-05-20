export type GameStatus = "active" | "finished";

export type AgentStatus = "active" | "competing" | "eliminated";

export type Agent = {
  id: string;
  name: string;
  model: string;
  description: string;
  systemPrompt: string;
  status: AgentStatus;
  eliminatedAt: string | null;
};

export type ChallengeStatus = "queued" | "running" | "completed" | "canceled";

export type ChallengePublic = {
  id: string;
  prompt: string;
  submittedBy: string;
  status: ChallengeStatus;
  createdAt: string;
};

export type ChallengeSummary = ChallengePublic;

export type SkirmishAgentResult = {
  agentId: string;
  answer: string | null;
  correct: boolean;
  eliminated: boolean;
  elapsedMs: number | null;
  error: string | null;
};

export type SkirmishPublic = {
  id: string;
  gameId: string;
  challenge: ChallengePublic;
  agentIds: string[];
  status: "running" | "resolved" | "canceled";
  startedAt: string;
  resolvedAt: string | null;
  results: SkirmishAgentResult[];
};

export type SkirmishSummary = Omit<SkirmishPublic, "challenge"> & {
  challenge: ChallengeSummary;
};

export type Game = {
  id: string;
  name: string;
  status: GameStatus;
  agents: Agent[];
  winner: Agent | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string;
  finishedAt: string | null;
};

export type GameState = {
  game: Game;
  agents: Agent[];
  activeSkirmish: SkirmishPublic | null;
  pendingChallenges: ChallengePublic[];
  skirmishHistory: SkirmishSummary[];
  winner: Agent | null;
};

export type BackendStateSnapshot = {
  generatedAt: string;
  gameCount: number;
  games: GameState[];
};

export type GameInput = {
  name: string;
  agents: Array<{
    id?: string;
    name: string;
    model: string;
    description?: string;
    systemPrompt: string;
  }>;
};

export type ChallengeInput = {
  prompt: string;
  expectedAnswer: string;
};

export type UserRole = "spectator" | "admin";

export type SessionUser = {
  username: string;
  role: UserRole;
};

export type AuthResponse = {
  token: string;
  expiresIn: number;
  user: SessionUser;
};

export type LoginResponse = AuthResponse;

export type ApiErrorBody = {
  error?: {
    code?: string;
    message?: string;
  };
};
