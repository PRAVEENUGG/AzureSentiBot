var restify = require('restify');
var builder = require('botbuilder');
var rp = require('request-promise');
var motivation = require("motivation");
var azure = require('botbuilder-azure');

var header = {'Content-Type':'application/json', 'Ocp-Apim-Subscription-Key':'1277193539f24f758670261ecbc22120'}
var requestUrl = 'https://southeastasia.api.cognitive.microsoft.com/text/analytics/v2.0/sentiment';

//configure database settings
var documentDbOptions = {
    host: 'https://maintainstate.documents.azure.com:443/',
    masterKey: 'L2M92OxHzLaYtw54ex60OBO8cZpbf9gOTEcqtoiLLuxAYJteRBsp3LSzomF24L98deeh3uC7Q1OO45ozPlRskw==',
    database: 'botdocdb',
    collection: 'botdata'
};

//Create objects to connect the Bot database
var docDbClient = new azure.DocumentDbClient(documentDbOptions);
var tableStorage = new azure.AzureBotStorage({ gzipData: false }, docDbClient);

// Setup Restify Server
var server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3978, function () {
   console.log('%s listening to %s', server.name, server.url);
});

// Create chat connector for communicating with the Bot Framework Service
var connector = new builder.ChatConnector({
    appId: process.env.MicrosoftAppId,
    appPassword: process.env.MicrosoftAppPassword
});

// Listen for messages from users
server.post('/api/messages', connector.listen());


// Receive messages from the user and respond by echoing each message back (prefixed with 'You said:')
var bot = new builder.UniversalBot(connector);
bot.set('storage', tableStorage);
// Enable Conversation Data persistence
bot.set('persistConversationData', true);

// Bot introduces itself and says hello upon conversation start
bot.on('conversationUpdate', function (message) {
    if (message.membersAdded[0].id === message.address.bot.id) {
        var reply = new builder.Message()
                .address(message.address)
                .text("Hello, I'm sentiBOT! How's your day going?");
        bot.send(reply);
    }
});

bot.dialog('/', function(session) {
      sendGetSentimentRequest(session.message.text).then(function (parsedBody) {
          console.log(parsedBody);
          var score = parsedBody.documents[0].score.toString();
          if(score > 0.80) {                    // happy
            console.log("Happy");
             session.beginDialog("/happy");
           } else if(score > 0.1) {             // stressed
             console.log("Stressed");
             session.beginDialog("/stressed");
           } else {                             // crisis
             console.log("Crisis");
             session.beginDialog("/crisis");
           }
      })
      .catch(function (err) {
          console.log("POST FAILED: " + err);
      });
});

bot.dialog("/stressed", [
	//We want to either cheer up the person->tell a joke or something
	function(session) {
		builder.Prompts.text(session, "You sound a bit stressed out, how can I help?");
	},
  function(session, results) {
    switch (stressedCases(session.message.text)) {
      case 1:
        session.send("What do you need to get done?");
        session.replaceDialog("/todo");
        break;
      case 2:
        builder.Prompts.text(session, findAJoke());
        session.endDialog("Hope that cheers you up.")
        break;
      default:
        builder.Prompts.text(session, "Sorry I don't know how to help with that, but I hope this quote will inspire you.");
        session.send(findMotivation());
        // session.send("Your mind will answer most questions if you learn to relax and wait for the answers.  --William S. Burroughs")
    }
	},
  function(session) {
    session.endDialog("I hope that helped:)");
	}
]);

bot.dialog('/todo', [
    function (session) {
        builder.Prompts.text(session, 'Let me know & I will help you schedule a reminder.');
    },
    function (session, results) {
      //setTimeout(startReminders(session.message), 2*60*1000);
      task = `${results.response}`;
      setTimeout(function() { startReminders(session.message); }, 5*1000);
      session.endDialog(`Ok, I will remind you to do *${results.response}* in 30 minutes.`);
    }
]);

function startReminders(msg){
  console.log("SETTING REMINDER");
  bot.beginDialog(msg.address, "/reminder")
}

bot.dialog('/reminder', [
    function (session) {
        session.send(`Hello, just want to remind you *${task}*`);
        builder.Prompts.choice(session, "Would you like me to remind you again?", "yes|no");
    },
    function (session, results) {
        console.log("LOGGING: " + results.response);
        if (session.message.text == "yes") {
          setTimeout(function() { startReminders(session.message); }, 5*1000);
          session.endDialog(`Ok, I will remind you again in 30 minutes.`);
        } else {
          session.endDialog("OK, hope that helped:)");
        }
    }
]);

function stressedCases(message){
  if (message.includes("todo") || message.includes("homework") || message.includes("work")){
    return 1;
  }else if (message.includes("joke") || message.includes("funny") || message.includes("sad")){
    return 2;
  }else {
    return 0;
  }
}

function findMotivation(){
  var m = motivation.get();
  return m;
}

function findAJoke(){
  switch (Math.floor(Math.random() * 4)) {
    case 0:
      return "Why aren’t koalas actual bears? They don’t meet the koalafications."
      break;
    case 1:
      return "You know why you never see elephants hiding up in trees? Because they’re really good at it."
      break;
    case 2:
      return "Two gold fish are in a tank. One looks at the other and says, “You know how to drive this thing?!”"
      break;
    default:
      return "How does NASA organize a party? They planet."
      break;
  }
}

function sendGetSentimentRequest(message) {
    var options = {
        method: 'POST',
        uri: requestUrl,
        body: {
            documents:[{id:'1', language: 'en', text:message}]
        },
        json: true, // Automatically stringifies the body to JSON,
        headers: header
    };
    return rp(options);
}

bot.dialog("/crisis", [
  function(session) {
    var question = "";
    if(session.message.text.includes("suicidal")) {
      question = "Please call this helpline for support: 1-833-456-4566?";
    } else if(session.message.text.includes("sad")) {
      question = "I think it would be a good idea to text a friend.";
    } else if(session.message.text.includes("depressed")) {
      question = "Check out this resource: http://www.bcmhsus.ca/our-services. Consider making an appointment with a professional.";
    } else {
          question = "Consider reaching out to your family or friends or making an appointment with a professional.";
      }
    builder.Prompts.text(session, question);
  },

  function(session, results) {
    session.send("Thank you. Remember that you don't have to go through this alone.");
    session.endDialog();
  }
]);

bot.dialog('/happy', [
  function(session) {
  builder.Prompts.text(session, "That's awesome! What would make you even happier?");
  },
  function(session, results) {
      getGiphy(results.response).then(function(gif) {
          // session.send(gif.toString());
          console.log(JSON.parse(gif).data);
          session.send({
              text: "Here you go!",
              attachments: [
                  {
                      contentType: 'image/gif',
                      contentUrl: JSON.parse(gif).data.images.original.url
                  }
              ]
          });
      }).catch(function(err)
      {
          console.log("Error getting giphy: " + err);
          session.send({
              text: "We couldn't find that unfortunately :(",
              attachments: [
                  {
                      contentType: 'image/gif',
                      contentUrl: 'https://media.giphy.com/media/ToMjGpt4q1nF76cJP9K/giphy.gif',
                      name: 'Chicken nugz are life'
                  }
              ]
          });
      }).then(function(idk) {
          builder.Prompts.text(session, "Would you like to see more?");
      });
  },
  function (session, results) {
      if (results.response === "Yes" || results.response === "yes") {
          session.beginDialog('/giphy');
      } else {
          session.endDialog("Have a great rest of your day!!!");
      }
  }
]);

bot.dialog('/giphy', [
    function(session) {
        builder.Prompts.text(session, "What would you like to see?");
    }, function(session, results) {
        getGiphy(results.response).then(function(gif) {
            // session.send(gif.toString());
            console.log(JSON.parse(gif).data);
            session.send({
                text: "Here you go!",
                attachments: [
                    {
                        contentType: 'image/gif',
                        contentUrl: JSON.parse(gif).data.images.original.url
                    }
                ]
            });
        }).catch(function(err)
        {
            console.log("Error getting giphy: " + err);
            session.send({
                text: "We couldn't find that unfortunately :(",
                attachments: [
                    {
                        contentType: 'image/gif',
                        contentUrl: 'https://media.giphy.com/media/ToMjGpt4q1nF76cJP9K/giphy.gif',
                        name: 'Chicken nugz are life'
                    }
                ]
            });
        }).then(function(idk) {
            builder.Prompts.text(session, "Would you like to see more?");
        });
    },
    function (session, results) {
        if (results.response === "Yes" || results.response === "yes") {
            session.beginDialog('/giphy');
        } else {
            session.endDialog("Have a great rest of your day!!!");
        }
      }
  ]);

function getGiphy(searchString) {
    var options = {
        method: 'GET',
        uri: 'https://api.giphy.com/v1/gifs/translate',
        qs: {
            s: searchString,
            api_key: '9n8AIaWULVu37sA1k8eE38IwnCCjmXP9'
        }
    }
    return rp(options);
}
