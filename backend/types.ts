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

export type Challenge = {
  id: string;
  prompt: string;
  expectedAnswer: string;
  submittedBy: string;
  status: ChallengeStatus;
  createdAt: string;
};

export type ChallengePublic = Omit<Challenge, "expectedAnswer">;

export type ChallengeSummary = ChallengePublic;

export type SkirmishStatus = "running" | "resolved" | "canceled";

export type SkirmishAgentResult = {
  agentId: string;
  answer: string | null;
  correct: boolean;
  eliminated: boolean;
  elapsedMs: number | null;
  error: string | null;
};

export type Skirmish = {
  id: string;
  gameId: string;
  challenge: Challenge;
  agentIds: string[];
  status: SkirmishStatus;
  startedAt: string;
  resolvedAt: string | null;
  results: SkirmishAgentResult[];
};

export type SkirmishPublic = Omit<Skirmish, "challenge"> & {
  challenge: ChallengePublic;
};

export type SkirmishSummary = Omit<SkirmishPublic, "challenge"> & {
  challenge: ChallengeSummary;
};

export type Game = {
  id: string;
  name: string;
  status: GameStatus;
  agents: Agent[];
  pendingChallenges: Challenge[];
  activeSkirmish: Skirmish | null;
  skirmishHistory: SkirmishSummary[];
  winner: Agent | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string;
  finishedAt: string | null;
};

export type GameState = {
  game: Omit<Game, "pendingChallenges" | "activeSkirmish" | "skirmishHistory">;
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

export type ChallengeSubmissionResult = {
  challenge: ChallengePublic;
  state: GameState;
};

export type LoginResponse = {
  token: string;
  expiresIn: number;
  user: SessionUser;
};

export type UserRole = "spectator" | "admin";

export type SessionUser = {
  username: string;
  role: UserRole;
};

export type ApiErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INTERNAL_ERROR";

export type ApiErrorResponse = {
  error: {
    code: ApiErrorCode;
    message: string;
  };
};
