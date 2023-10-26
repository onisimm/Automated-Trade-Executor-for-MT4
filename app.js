const express = require("express");
const fs = require("fs");
const axios = require("axios");
const cron = require("node-cron");
const app = express();
const port = 8000;

app.use(express.json());
app.use(express.text());

// Initial trade counts - DO NOT change
const eurjpyTradeCount = { "11-15": 0 };
const eurusdTradeCount = { "10-15": 0 };
const usdchfTradeCount = { "07-09": 0, "11-15": 0 };
const usdcadTradeCount = { "11-15": 0 };
var overallTradeCount = 0;

// Max trades per time session - max trades values CAN be changed
const eurjpyMaxTrades = { "11-15": 3 };
const eurusdMaxTrades = { "10-15": 3 };
const usdchfMaxTrades = { "07-09": 3, "11-15": 4 };
const usdcadMaxTrades = { "11-15": 4 };
var overallMaxTrades = 3;

// Trade parameters for each session - CAN be changed
const tradeParams = {
  EURJPY: {
    "11-15": { risk: 2.02, sl: 18.5, tp: 6.5 }, // before swap: risk: 0.64, sl: 6.5, tp: 18.5
  },
  EURUSD: {
    "10-15": { risk: 3.3, sl: 20, tp: 5 }, // before swap: risk: 3.3, sl: 5, tp: 20
  },
  USDCHF: {
    "07-09": { risk: 0.26, sl: 30, tp: 12 }, // before swap: risk: 0.26, sl: 12, tp: 30
    "11-15": { risk: 0.26, sl: 30, tp: 12 }, // before swap: risk: 0.26, sl: 12, tp: 30
  },
  USDCAD: {
    "11-15": { risk: 1.21, sl: 30, tp: 10 }, // before swap: risk: 0.4, sl: 10, tp: 30
  },
};

// Active currencies
// true = active, false = inactive
// Do not forget to put ";" at the end of the line
var eurjpyActive = true;
var eurusdActive = false;
var usdchfActive = false;
var usdcadActive = true;

// Set the bot STATE: ACTIVE / inactive
// true = active, false = inactive
var botON = true;

// Switch command (switch buy with sell, or sell with buy)
// true - switch, false - do not switch
// Do not forget to put ";" at the end of the line
var switchCommand = true;

function getTime() {
  const currentDate = new Date();
  const currentHour = currentDate.getHours();
  const currentMinute = currentDate.getMinutes();
  const currentSecond = currentDate.getSeconds();

  const getStringTime = (currentHour, currentMinute, currentSecond) => {
    // Function to format a number as a two-digit string
    const formatTwoDigits = (number) => {
      return number.toString().padStart(2, "0");
    };

    // Formatting the components as two-digit strings
    const formattedHour = formatTwoDigits(currentHour);
    const formattedMinute = formatTwoDigits(currentMinute);
    const formattedSecond = formatTwoDigits(currentSecond);

    // Creating the formatted time string
    const formattedTime = `${formattedHour}:${formattedMinute}:${formattedSecond}`;

    return formattedTime;
  };

  return {
    hour: currentHour,
    minute: currentMinute,
    second: currentSecond,
    stringTime: getStringTime(currentHour, currentMinute, currentSecond),
  };
}

// generates the file name for the log file of the day
const getFileName = () => {
  const currentDate = new Date();
  let todayMonth = (currentDate.getMonth() + 1) % 12;
  let todayDay = currentDate.getDate();
  let currentHour = currentDate.getHours();
  // let currentHour = 0;

  const fileName = `tradeLogs/trades${todayMonth}-${todayDay}.txt`;
  return fileName;
};

// // Function to write logs to a file
const writeLogToFile = (...args) => {
  const log = args.join(" ");

  fileName = getFileName();

  fs.appendFile(fileName, log + "\n", (err) => {
    if (err) {
      console.error("Error writing log to file:", err);
    }
  });
};

// check if the current hour is within a time session
const getSession = (currentHour, currentMinute, currency) => {
  let session = null;
  if (currency === "EURJPY") {
    // Check for EURJPY sessions
    if (currentHour >= 11 && currentHour <= 15) {
      // session: 11-15
      if (
        (currentHour === 11 && currentMinute >= 2) ||
        (currentHour != 11 && currentHour != 15) ||
        (currentHour === 15 && currentMinute <= 1)
      ) {
        session = "11-15";
      }
    }
  } else if (currency === "EURUSD") {
    // Check for EURUSD sessions
    if (currentHour >= 10 && currentHour <= 15) {
      // session: 10-15
      if (
        (currentHour === 10 && currentMinute >= 2) ||
        (currentHour != 10 && currentHour != 15) ||
        (currentHour === 15 && currentMinute <= 1)
      ) {
        session = "10-15";
      }
    }
  } else if (currency === "USDCHF") {
    // Check for USDCHF sessions
    if (currentHour >= 7 && currentHour <= 9) {
      // session: 07-09
      if (
        (currentHour === 7 && currentMinute >= 2) ||
        (currentHour != 7 && currentHour != 9) ||
        (currentHour === 9 && currentMinute <= 1)
      ) {
        session = "07-09";
      }
    } else if (currentHour >= 11 && currentHour <= 15) {
      // session: 11-15
      if (
        (currentHour === 11 && currentMinute >= 2) ||
        (currentHour != 11 && currentHour != 15) ||
        (currentHour === 15 && currentMinute <= 1)
      ) {
        session = "11-15";
      }
    }
  } else if (currency === "USDCAD") {
    // check for USDCAD sessions
    if (currentHour >= 11 && currentHour <= 15) {
      // session: 11-15
      if (
        (currentHour === 11 && currentMinute >= 2) ||
        (currentHour != 11 && currentHour != 15) ||
        (currentHour === 15 && currentMinute <= 1)
      ) {
        session = "11-15";
      }
    }
  }

  return session ? { session, params: tradeParams[currency][session] } : null;
};

// forwards the TW message towards PineConnector and MT4
const forwardToPineConnector = async (data) => {
  const pineconnectorUrl = "https://pineconnector.net/webhook/";

  writeLogToFile("Message built:", data);
  console.log("Message built:", data);

  try {
    const response = await axios.post(pineconnectorUrl, data);

    if (response.status === 200) {
      writeLogToFile("successfully forwarded data to Pineconnector");
      console.log(
        "\x1b[32msuccessfully forwarded data to Pineconnector \x1b[0m"
      );
    } else {
      writeLogToFile("failed to forward data to Pineconnector");
      console.log(
        "\x1b[31mfailed to forward data to Pineconnector \x1b[0m",
        response.status,
        response.data
      );
    }
  } catch (error) {
    writeLogToFile("error forwarding data to Pineconnector");
    console.log("\x1b[31merror forwarding data to Pineconnector \x1b[0m");
  }
};

// MAIN
app.post("/webhook", (req, res) => {
  let currentTime = getTime();

  // currentTime.hour = 11;

  console.log(`\n\nReceived data (${req.body}) at ${currentTime.stringTime}`);
  writeLogToFile("\nReceived data:", req.body, `at ${currentTime.stringTime}`);

  // Switch buy with sell (or the other way around)
  if (switchCommand) {
    if (req.body.includes("buy")) {
      req.body = req.body.replace("buy", "sell");
    } else {
      req.body = req.body.replace("sell", "buy");
    }
  }

  console.log(` New data: ${req.body}`);
  writeLogToFile(" New data: ", req.body);

  const data = req.body.split(",");
  const currency = data[2];

  if (currentTime.second === 58 || currentTime.second === 59) {
    currentTime.minute = (currentTime.minute + 1) % 60;
    currentTime.second = 0;
  }

  if (botON) {
    // forward the message if the currency it's allowed to trade during the current time

    // console.log(`Overall trade count: ${overallTradeCount}`);
    if (overallTradeCount < overallMaxTrades) {
      // forward the message if the max overall number of trades is not reached
      if (currency === "EURJPY") {
        if (eurjpyActive) {
          const sessionInfo = getSession(
            currentTime.hour,
            currentTime.minute,
            currency
          );

          if (
            sessionInfo &&
            eurjpyTradeCount[sessionInfo.session] <
              eurjpyMaxTrades[sessionInfo.session]
          ) {
            eurjpyTradeCount[sessionInfo.session]++;
            forwardToPineConnector(
              req.body +
                ",risk=" +
                sessionInfo.params.risk +
                ",sl=" +
                sessionInfo.params.sl +
                ",tp=" +
                sessionInfo.params.tp
            );
            console.log(
              `EURJPY trade count for ${sessionInfo.session} is now ${
                eurjpyTradeCount[sessionInfo.session]
              }`
            );
            writeLogToFile(
              `EURJPY trade count for ${sessionInfo.session} is now ${
                eurjpyTradeCount[sessionInfo.session]
              }`
            );

            overallTradeCount++;
          } else {
            res
              .status(200)
              .json({ status: "out of trading hours or max trades reached" });
            if (sessionInfo && sessionInfo.session) {
              writeLogToFile("Session: ", sessionInfo.session);
              writeLogToFile("but max trades reached");
              console.log("Session: ", sessionInfo.session);
              console.log("but \x1b[31mmax trades reached \x1b[0m");
            } else {
              writeLogToFile("Out of trading hours");
              console.log("\x1b[31mOut of trading hours \x1b[0m");
            }
            return;
          }
        } else {
          writeLogToFile("EURJPY not active");
          console.log("\x1b[90m EURJPY not active \x1b[0m");
        }
      }

      if (currency === "EURUSD") {
        if (eurusdActive) {
          const sessionInfo = getSession(
            currentTime.hour,
            currentTime.minute,
            currency
          );

          if (
            sessionInfo &&
            eurusdTradeCount[sessionInfo.session] <
              eurusdMaxTrades[sessionInfo.session]
          ) {
            eurusdTradeCount[sessionInfo.session]++;
            forwardToPineConnector(
              req.body +
                ",risk=" +
                sessionInfo.params.risk +
                ",sl=" +
                sessionInfo.params.sl +
                ",tp=" +
                sessionInfo.params.tp
            );
            console.log(
              `EURUSD trade count for ${sessionInfo.session} is now ${
                eurusdTradeCount[sessionInfo.session]
              }`
            );
            writeLogToFile(
              `EURUSD trade count for ${sessionInfo.session} is now ${
                eurusdTradeCount[sessionInfo.session]
              }`
            );

            overallTradeCount++;
          } else {
            res
              .status(200)
              .json({ status: "out of trading hours or max trades reached" });
            if (sessionInfo && sessionInfo.session) {
              writeLogToFile("Session: ", sessionInfo.session);
              writeLogToFile("but max trades reached");
              console.log("Session: ", sessionInfo.session);
              console.log("but \x1b[31mmax trades reached \x1b[0m");
            } else {
              writeLogToFile("Out of trading hours");
              console.log("\x1b[31mOut of trading hours \x1b[0m");
            }
            return;
          }
        } else {
          writeLogToFile("EURUSD not active");
          console.log("\x1b[90m EURUSD not active \x1b[0m");
        }
      }

      if (currency === "USDCHF") {
        if (usdchfActive) {
          const sessionInfo = getSession(
            currentTime.hour,
            currentTime.minute,
            currency
          );

          if (
            sessionInfo &&
            usdchfTradeCount[sessionInfo.session] <
              usdchfMaxTrades[sessionInfo.session]
          ) {
            usdchfTradeCount[sessionInfo.session]++;
            forwardToPineConnector(
              req.body +
                ",risk=" +
                sessionInfo.params.risk +
                ",sl=" +
                sessionInfo.params.sl +
                ",tp=" +
                sessionInfo.params.tp
            );
            console.log(
              `USDCHF trade count for ${sessionInfo.session} is now ${
                usdchfTradeCount[sessionInfo.session]
              }`
            );
            writeLogToFile(
              `USDCHF trade count for ${sessionInfo.session} is now ${
                usdchfTradeCount[sessionInfo.session]
              }`
            );

            overallTradeCount++;
          } else {
            res
              .status(200)
              .json({ status: "out of trading hours or max trades reached" });
            if (sessionInfo && sessionInfo.session) {
              writeLogToFile("Session: ", sessionInfo.session);
              writeLogToFile("but max trades reached");
              console.log("Session: ", sessionInfo.session);
              console.log("but \x1b[31mmax trades reached \x1b[0m");
            } else {
              writeLogToFile("Out of trading hours");
              console.log("\x1b[31mOut of trading hours \x1b[0m");
            }
            return;
          }
        } else {
          writeLogToFile("USDCHF not active");
          console.log("\x1b[90m USDCHF not active \x1b[0m");
        }
      }

      if (currency === "USDCAD") {
        if (usdcadActive) {
          const sessionInfo = getSession(
            currentTime.hour,
            currentTime.minute,
            currency
          );

          if (
            sessionInfo &&
            usdcadTradeCount[sessionInfo.session] <
              usdcadMaxTrades[sessionInfo.session]
          ) {
            usdcadTradeCount[sessionInfo.session]++;
            forwardToPineConnector(
              req.body +
                ",risk=" +
                sessionInfo.params.risk +
                ",sl=" +
                sessionInfo.params.sl +
                ",tp=" +
                sessionInfo.params.tp
            );
            console.log(
              `USDCAD trade count for ${sessionInfo.session} is now ${
                usdcadTradeCount[sessionInfo.session]
              }`
            );
            writeLogToFile(
              `USDCAD trade count for ${sessionInfo.session} is now ${
                usdcadTradeCount[sessionInfo.session]
              }`
            );

            overallTradeCount++;
          } else {
            res
              .status(200)
              .json({ status: "out of trading hours or max trades reached" });
            if (sessionInfo && sessionInfo.session) {
              writeLogToFile("Session: ", sessionInfo.session);
              writeLogToFile("but max trades reached");
              console.log("Session: ", sessionInfo.session);
              console.log("but \x1b[31mmax trades reached \x1b[0m");
            } else {
              writeLogToFile("Out of trading hours");
              console.log("\x1b[31mOut of trading hours \x1b[0m");
            }
            return;
          }
        } else {
          writeLogToFile("USDCAD not active");
          console.log("\x1b[90m USDCAD not active \x1b[0m");
        }
      }
    } else {
      writeLogToFile("Max overall trades reached");
      console.log("\x1b[31mMax overall trades reached \x1b[0m");
    }

    res.status(200).json({ status: "success" });
  } else {
    writeLogToFile(" The program is inactive");
    console.log("\x1b[90m The program is inactive \x1b[0m");
  }
});

// When restarting the server in a day, reinitialize trade counts for each currency
// based on the last values found in the log file of the day
const fsPromises = fs.promises;

const initializeTradeCounts = async () => {
  const fileName = getFileName();

  try {
    const data = await fsPromises.readFile(fileName, "utf8");

    const lines = data.split("\n");

    if (eurjpyActive) {
      const eurjpyTradeCounts = lines.filter((line) =>
        line.includes("EURJPY trade count for")
      );

      for (let session in eurjpyTradeCount) {
        eurjpyTradeCount[session] = 0;
      }

      eurjpyTradeCounts.forEach((eurjpyCountLine) => {
        const session = eurjpyCountLine.match(/for\s+(\d+-\d+)/);
        const count = eurjpyCountLine.match(/(\d+)$/);
        if (session && count) {
          const sessionKey = session[1];
          eurjpyTradeCount[sessionKey] = parseInt(count[1]);
        }
      });

      for (let session in eurjpyTradeCount) {
        console.log(
          `EURJPY trade count for ${session} is ${eurjpyTradeCount[session]}`
        );
        writeLogToFile(
          `EURJPY trade count for ${session} is ${eurjpyTradeCount[session]}`
        );
        overallTradeCount += eurjpyTradeCount[session];
      }
    }

    if (eurusdActive) {
      const eurusdTradeCounts = lines.filter((line) =>
        line.includes("EURUSD trade count for")
      );

      for (let session in eurusdTradeCount) {
        eurusdTradeCount[session] = 0;
      }

      eurusdTradeCounts.forEach((eurusdCountLine) => {
        const session = eurusdCountLine.match(/for\s+(\d+-\d+)/);
        const count = eurusdCountLine.match(/(\d+)$/);
        if (session && count) {
          const sessionKey = session[1];
          eurusdTradeCount[sessionKey] = parseInt(count[1]);
        }
      });

      for (let session in eurusdTradeCount) {
        console.log(
          `EURUSD trade count for ${session} is ${eurusdTradeCount[session]}`
        );
        writeLogToFile(
          `EURUSD trade count for ${session} is ${eurusdTradeCount[session]}`
        );
        overallTradeCount += eurusdTradeCount[session];
      }
    }

    if (usdchfActive) {
      const usdchfTradeCounts = lines.filter((line) =>
        line.includes("USDCHF trade count for")
      );

      for (let session in usdchfTradeCount) {
        usdchfTradeCount[session] = 0;
      }

      usdchfTradeCounts.forEach((usdchfCountLine) => {
        const session = usdchfCountLine.match(/for\s+(\d+-\d+)/);
        const count = usdchfCountLine.match(/(\d+)$/);
        if (session && count) {
          const sessionKey = session[1];
          usdchfTradeCount[sessionKey] = parseInt(count[1]);
        }
      });

      for (let session in usdchfTradeCount) {
        console.log(
          `USDCHF trade count for ${session} is ${usdchfTradeCount[session]}`
        );
        writeLogToFile(
          `USDCHF trade count for ${session} is ${usdchfTradeCount[session]}`
        );
        overallTradeCount += usdchfTradeCount[session];
      }
    }

    if (usdcadActive) {
      const usdcadTradeCounts = lines.filter((line) =>
        line.includes("USDCAD trade count for")
      );

      for (let session in usdcadTradeCount) {
        usdcadTradeCount[session] = 0;
      }

      usdcadTradeCounts.forEach((usdcadCountLine) => {
        const session = usdcadCountLine.match(/for\s+(\d+-\d+)/);
        const count = usdcadCountLine.match(/(\d+)$/);
        if (session && count) {
          const sessionKey = session[1];
          usdcadTradeCount[sessionKey] = parseInt(count[1]);
        }
      });

      for (let session in usdcadTradeCount) {
        console.log(
          `USDCAD trade count for ${session} is ${usdcadTradeCount[session]}`
        );
        writeLogToFile(
          `USDCAD trade count for ${session} is ${usdcadTradeCount[session]}`
        );
        overallTradeCount += usdcadTradeCount[session];
      }
    }

    console.log(
      ` The overall trade count is ${overallTradeCount} -> ${
        overallMaxTrades - overallTradeCount
      } trades left\n`
    );
    writeLogToFile(
      ` The overall trade count is ${overallTradeCount} -> ${
        overallMaxTrades - overallTradeCount
      } trades left\n`
    );
  } catch (err) {
    console.error("Error reading log file:", err);
  }
};

const startServer = async () => {
  let currentTime = getTime();

  writeLogToFile("\n---------Program (re)started at:", currentTime.stringTime);
  console.log(`\n Program (re)started at: ${currentTime.stringTime}\n`);

  if (botON) {
    await initializeTradeCounts();
  } else {
    writeLogToFile("The bot is turned off.");
    console.log("The bot is turned off.");
  }

  const server = app.listen(port, "0.0.0.0", () => {
    console.log(
      "  \x1b[31mDONT FORGET TO CHANGE THE WEBHOOK (IF you just started ngrok)\x1b[0m"
    );
    console.log(
      "  \x1b[32mServer listening at http://0.0.0.0:${port}/webhook\x1b[0m"
    );
  });
};

(async () => {
  await startServer();
})();

// TEST FUNCTIONS

// const forwardToWebhook = async () => {
// 	const webhookUrl = 'https://0633-2a05-d01c-279-4d00-942b-fa1a-affc-e4a0.ngrok-free.app/webhook';

// 	try {
// 		const response = await axios.post(webhookUrl, '6759856898261,sell,USDCAD', {
// 			headers: {
// 				'Content-Type': 'text/plain; charset=utf-8'
// 			}
// 		});

// 		if (response.status === 200) {
// 			console.log('Successfully forwarded data to webhook');
// 		}
// 		else {
// 		console.error('Failed to forward data to webhook', response.status, response.data);
// 		}
// 	}
// 	catch (error) {
// 	console.error('Error forwarding data to webhook', error);
// 	}
// };

// forwardToWebhook();

// const checkSessions = () => {
// const currentHour = 11;
// const currentMinute = 2;
// const session = getSession(currentHour, currentMinute, 'EURJPY');
// console.log(session);
// };

// checkSessions();
