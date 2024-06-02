const express = require('express');
const app = express();
const port = 3000;
const { MongoClient, ServerApiVersion } = require('mongodb');
const fs = require('fs');

const DB_USER = process.env['DB_USER'];
const DB_PWD = process.env['DB_PWD'];
const DB_URL = process.env['DB_URL'];
const DB_NAME = "task-";
const DB_COLLECTION_NAME = "teams";

const uri = `mongodb+srv://${DB_USER}:${DB_PWD}@${DB_URL}/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

let db;

async function run() {
  try {
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    db = client.db(DB_NAME);
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
  }
}

app.use(express.json());

app.post('/add-team', async (req, res) => {
  try {
    const teamData = req.body;
    const { teamName, players, captain, viceCaptain } = teamData;

    const playerCounts = {
      WK: 0,
      BAT: 0,
      AR: 0,
      BWL: 0,
    };

    players.forEach((player) => {
      playerCounts[player.type]++;
    });

    if (
      playerCounts.WK < 1 ||
      playerCounts.BAT < 1 ||
      playerCounts.AR < 1 ||
      playerCounts.BWL < 1 ||
      players.length !== 11
    ) {
      return res.status(400).json({ error: "Invalid team composition" });
    }

    await db.collection(DB_COLLECTION_NAME).insertOne({
      teamName,
      players,
      captain,
      viceCaptain,
      points: 0
    });

    res.status(200).json({ message: "Team entry added successfully!" });
  } catch (error) {
    console.error("Error adding team entry:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post('/process-result', async (req, res) => {
  try {
    const matchResults = await fetchMatchResults();
    const playerPoints = calculatePlayerPoints(matchResults);
    await updateTeamPoints(playerPoints);
    res.status(200).json({ message: "Match result processed successfully!" });
  } catch (error) {
    console.error("Error processing match result:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get('/team-result', async (req, res) => {
  try {
    const teamEntries = await db.collection(DB_COLLECTION_NAME).find().toArray();
    const winningTeams = calculateWinningTeams(teamEntries);
    res.status(200).json({ winner: winningTeams });
  } catch (error) {
    console.error("Error fetching team results:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

function fetchMatchResults() {
  return new Promise((resolve, reject) => {
    fs.readFile('data/match.json', 'utf8', (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(JSON.parse(data));
      }
    });
  });
}

function calculatePlayerPoints(matchResults) {
  let playerPoints = {};

  matchResults.forEach((result) => {
    result.players.forEach((player) => {
      if (!playerPoints[player.name]) {
        playerPoints[player.name] = 0;
      }

      playerPoints[player.name] += player.runs * 1;
      playerPoints[player.name] += player.boundaryBonus * 1;
      playerPoints[player.name] += player.sixBonus * 2;
      if (player.runs >= 30) {
        playerPoints[player.name] += 4;
      }
      if (player.runs >= 50) {
        playerPoints[player.name] += 8;
      }
      if (player.runs >= 100) {
        playerPoints[player.name] += 16;
      }
      if (player.dismissal === "duck" && (player.type === "BAT" || player.type === "WK" || player.type === "AR")) {
        playerPoints[player.name] -= 2;
      }

      playerPoints[player.name] += player.wickets * 25;
      playerPoints[player.name] += player.bonus * 8;
      if (player.wickets >= 3) {
        playerPoints[player.name] += 4;
      }
      if (player.wickets >= 4) {
        playerPoints[player.name] += 8;
      }
      if (player.wickets >= 5) {
        playerPoints[player.name] += 16;
      }
      if (player.maiden) {
        playerPoints[player.name] += 12;
      }

      playerPoints[player.name] += player.catches * 8;
      if (player.catches >= 3) {
        playerPoints[player.name] += 4;
      }
      playerPoints[player.name] += player.stumpings * 12;
      playerPoints[player.name] += player.runOuts * 6;
    });
  });

  return playerPoints;
}

async function updateTeamPoints(playerPoints) {
  try {
    const teamsCollection = db.collection(DB_COLLECTION_NAME);

    for (const playerName in playerPoints) {
      if (Object.hasOwnProperty.call(playerPoints, playerName)) {
        const points = playerPoints[playerName];
        await teamsCollection.updateMany(
          { "players.name": playerName },
          { $inc: { points: points } }
        );
      }
    }
  } catch (error) {
    console.error("Error updating team points:", error);
    throw error;
  }
}

function calculateWinningTeams(teamEntries) {
  let maxPoints = 0;
  let winningTeams = [];

  teamEntries.forEach((team) => {
    if (team.points > maxPoints) {
      maxPoints = team.points;
    }
  });

  teamEntries.forEach((team) => {
    if (team.points === maxPoints) {
      winningTeams.push(team.teamName);
    }
  });

  return winningTeams;
}

app.listen(port, () => {
  console.log(`App listening on port ${port}`);
});

run();
