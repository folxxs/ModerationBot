// bot version 0.0.2, made by mvqna
require('dotenv').config(); // Add this line at the top to load environment variables
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const { REST } = require('@discordjs/rest'); // Import REST @discordjs/rest
const { Routes } = require('discord-api-types/v10'); // Import Routes discord-api-types

const TOKEN = process.env.TOKEN; // Access the token from the environment variable

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

client.commands = new Collection();
const leaderboard = new Map(); // Leaderboard to track banana sizes

// Define and register commands
client.commands.set('ping', {
    data: {
        name: 'ping',
        description: 'Shows the bot\'s latency'
    },
    execute: async (interaction) => {
        const latency = Math.round(client.ws.ping);
        await interaction.reply(`Pong! ${latency}ms`);
    }
});

client.commands.set('kick', {
    data: {
        name: 'kick',
        description: 'Kicks a user from the server',
        options: [
            {
                name: 'user',
                type: 6, // USER type
                description: 'The user to kick',
                required: true
            },
            {
                name: 'reason',
                type: 3, // STRING type
                description: 'The reason for kicking'
            }
        ]
    },
    execute: async (interaction) => {
        if (!interaction.member.permissions.has('KICK_MEMBERS')) {
            return interaction.reply({ content: "You don't have permission to use this command.", ephemeral: true });
        }

        const member = interaction.options.getMember('user');
        const reason = interaction.options.getString('reason') || 'No reason provided';

        if (member) {
            await member.kick(reason);
            await interaction.reply(`${member} has been kicked.`);
        } else {
            await interaction.reply('User not found.');
        }
    }
});

client.commands.set('ban', {
    data: {
        name: 'ban',
        description: 'Bans a user from the server',
        options: [
            {
                name: 'user',
                type: 6, // USER type
                description: 'The user to ban',
                required: true
            },
            {
                name: 'reason',
                type: 3, // STRING type
                description: 'The reason for banning'
            }
        ]
    },
    execute: async (interaction) => {
        if (!interaction.member.permissions.has('BAN_MEMBERS')) {
            return interaction.reply({ content: "You don't have permission to use this command.", ephemeral: true });
        }

        const member = interaction.options.getMember('user');
        const reason = interaction.options.getString('reason') || 'No reason provided';

        try {
            await member.ban({ reason });
            await interaction.reply(`${member} has been banned.`);
        } catch (error) {
            await interaction.reply({ content: `Unable to ban ${member}.`, ephemeral: true });
        }
    }
});

client.commands.set('mute', {
    data: {
        name: 'mute',
        description: 'Mutes a user in the server',
        options: [
            {
                name: 'user',
                type: 6, // USER type
                description: 'The user to mute',
                required: true
            },
            {
                name: 'reason',
                type: 3, // STRING type
                description: 'The reason for muting'
            }
        ]
    },
    execute: async (interaction) => {
        if (!interaction.member.permissions.has('MANAGE_ROLES')) {
            return interaction.reply({ content: "You don't have permission to use this command.", ephemeral: true });
        }

        const member = interaction.options.getMember('user');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        let muteRole = interaction.guild.roles.cache.find(role => role.name === 'Muted');

        if (!muteRole) {
            muteRole = await interaction.guild.roles.create({
                name: 'Muted',
                permissions: []
            });

            interaction.guild.channels.cache.forEach(async (channel) => {
                await channel.permissionOverwrites.create(muteRole, {
                    SEND_MESSAGES: false,
                    SPEAK: false
                });
            });
        }

        await member.roles.add(muteRole, reason);
        await interaction.reply(`${member} has been muted.`);
    }
});

client.commands.set('roll', {
    data: {
        name: 'roll',
        description: 'Rolls a dice and returns a number between 1 and 6'
    },
    execute: async (interaction) => {
        const diceRoll = Math.floor(Math.random() * 6) + 1;
        await interaction.reply(`You rolled a ${diceRoll}!`);
    }
});

client.commands.set('rps', {
    data: {
        name: 'rps',
        description: 'Play rock, paper, scissors with the bot',
        options: [
            {
                name: 'choice',
                type: 3, // STRING type
                description: 'Your choice: rock, paper, or scissors',
                required: true,
                choices: [
                    { name: 'Rock', value: 'rock' },
                    { name: 'Paper', value: 'paper' },
                    { name: 'Scissors', value: 'scissors' }
                ]
            }
        ]
    },
    execute: async (interaction) => {
        const choices = ['rock', 'paper', 'scissors'];
        const userChoice = interaction.options.getString('choice');
        const botChoice = choices[Math.floor(Math.random() * choices.length)];

        if (!choices.includes(userChoice)) {
            return interaction.reply('Please choose rock, paper, or scissors.');
        }

        let result;
        if (userChoice === botChoice) {
            result = "It's a tie!";
        } else if (
            (userChoice === 'rock' && botChoice === 'scissors') ||
            (userChoice === 'paper' && botChoice === 'rock') ||
            (userChoice === 'scissors' && botChoice === 'paper')
        ) {
            result = "You win!";
        } else {
            result = "Bot wins!";
        }

        await interaction.reply(`You chose ${userChoice}, I chose ${botChoice}. ${result}`);
    }
});

client.commands.set('guess', {
    data: {
        name: 'guess',
        description: 'Guess a number between 1 and 10',
        options: [
            {
                name: 'number',
                type: 4, // INTEGER type
                description: 'Your guess (1-10)',
                required: true
            }
        ]
    },
    execute: async (interaction) => {
        const guess = interaction.options.getInteger('number');
        if (guess < 1 || guess > 10) {
            return interaction.reply('Please choose a number between 1 and 10.');
        }

        const randomNumber = Math.floor(Math.random() * 10) + 1;
        const result = guess === randomNumber
            ? `Congrats! You guessed the number ${randomNumber}!`
            : `Sorry, the correct number was ${randomNumber}.`;

        await interaction.reply(result);
    }
});

client.commands.set('clear', {
    data: {
        name: 'clear',
        description: 'Clears a specified number of messages (up to 30)',
        options: [
            {
                name: 'amount',
                type: 4, // INTEGER type
                description: 'Number of messages to delete',
                required: true
            }
        ]
    },
    execute: async (interaction) => {
        if (!interaction.member.permissions.has('MANAGE_MESSAGES')) {
            return interaction.reply({ content: "You don't have permission to use this command.", ephemeral: true });
        }

        const amount = interaction.options.getInteger('amount');
        if (amount < 1 || amount > 30) {
            return interaction.reply({ content: "Please specify a number between 1 and 30.", ephemeral: true });
        }

        const messages = await interaction.channel.messages.fetch({ limit: amount });
        await interaction.channel.bulkDelete(messages);

        await interaction.reply({ content: `Deleted ${amount} messages.`, ephemeral: true });
    }
});

// I dont really know why i did this...
client.commands.set('banana', {
    data: {
        name: 'banana',
        description: 'Generates a random banana size and tracks it in a leaderboard.'
    },
    execute: async (interaction) => {
        const random = Math.random();
        let size;

        // 1/50 chance for 30 cm
        if (random < 1 / 50) {
            size = 30;
        } else {
            size = Math.floor(Math.random() * (30 - 5)) + 5; // Random size between 5 and 29
        }

        const userId = interaction.user.id;
        const username = interaction.user.username;

        // Update leaderboard
        if (!leaderboard.has(userId)) {
            leaderboard.set(userId, { username, sizes: [] });
        }
        leaderboard.get(userId).sizes.push(size);

        await interaction.reply(`Your banana size is: ${size} cm 🍌`);
    }
});


client.commands.set('banana-leaderboard', {
    data: {
        name: 'banana-leaderboard',
        description: 'Shows the banana leaderboard.'
    },
    execute: async (interaction) => {
        if (leaderboard.size === 0) {
            return await interaction.reply('The leaderboard is empty! Be the first to generate a banana size. 🍌');
        }

        const sortedLeaderboard = [...leaderboard.values()]
            .sort((a, b) => Math.max(...b.sizes) - Math.max(...a.sizes)) // Sort by highest size
            .map((entry, index) => `${index + 1}. ${entry.username}: ${Math.max(...entry.sizes)} cm`);

        await interaction.reply(`**Banana Leaderboard:**\n${sortedLeaderboard.join('\n')}`);
    }
});


client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);

    // Regist Commands
    const commands = client.commands.map(cmd => cmd.data);
    const rest = new REST({ version: '10' }).setToken(TOKEN);

    try {
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );
        console.log('Successfully registered application commands.');
    } catch (error) {
        console.error('Error registering commands:', error);
    }
});



client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(error);
        await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
    }
});

client.login(TOKEN);
