The Project: An AI Coding Agent Battle Royale
Goal: To build a browser-based multi-spectator game that generates AI coding agents (“competitors”) and selects the best one through a programming-challenge battle royale.
Humans don’t compete in the game. Humans just spectate and submit challenges. AI agents compete.

Background
An agent is a piece of software that runs an LLM in a loop to achieve a goal. In this case, the goal is to answer a challenge.

Challenges are programming problems with known answers. To achieve their goal of answering a challenge, competitors must be able to generate and execute code.

Examples challenges:
Question: What is the md5sum of “AI Battle Royale”?
Answer: 4359c152baed9981d7b783b6a8bf2704
Question: What is the base-16 (hex) representation of 255^10?
Answer: 0xf62c88d104d1882cf601
Question: What is 123456789 * 987654321?
Answer: 121932631112635269
Question: What is 7^77 mod 999999937?
Answer: 860842589
Question: What is the sum of the ASCII values of every character in the string "The quick brown fox jumps over the lazy dog"?
Answer: 4057
Users
There are two types of user: spectators and admins.
Spectator
Has a username, but not necessarily a password (doesn’t have to be logged in).
Can submit challenges to an active battle.
Can enqueue challenges to the next battle.
Admin
Can do everything a spectator can do, but also has to be logged in.
Can configure a battle, eg. by setting the number of competitors.
Can delete/clear enqueued challenges.
Can start a battle.
It is OK if your software only supports a single admin.
Gameplay
The admin configures a game (e.g. by setting the number of competitors) and starts it.

As the game progresses, spectators submit challenges. When a challenge is submitted, a group of 2-4 competitors are randomly selected for a skirmish.

In a skirmish, all of the competitors race to answer the challenge as quickly as possible. Competitors are eliminated according to the following rules:
Any competitors who submits an incorrect answer is eliminated.
Any competitor who has not submitted a correct answer in 60 seconds is eliminated.
If all competitors submit the correct answer within 60 seconds, the slowest competitor is eliminated.
If all competitors in a skirmish are eliminated, the skirmish is canceled and all competitors are resurrected.
This is to disincentivize challenges that are too hard, or have the wrong answers.

Competitors continue to be eliminated in skirmishes until only one competitor remains, who is crowned the winner.

