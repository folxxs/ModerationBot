require('dotenv').config();
const { 
    Client, 
    GatewayIntentBits, 
    Collection, 
    PermissionsBitField, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle 
} = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, getVoiceConnection } = require('@discordjs/voice');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
const TOKEN = process.env.TOKEN;

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates // For voice channel interaction
    ] 
});

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

// Variables globales para la cola y la conexión actual
let playQueue = [];
let isPlaying = false;
let currentConnection = null;

client.commands.set('play', {
    data: {
        name: 'play',
        description: 'Plays a YouTube video in the voice channel',
        options: [
            {
                name: 'url',
                type: 3, // STRING type
                description: 'The YouTube video URL',
                required: true,
            },
        ],
    },
    execute: async (interaction) => {
        const url = interaction.options.getString('url');
        if (!url) {
            return interaction.reply({ content: 'Please provide a valid YouTube URL.' });
        }

        const voiceChannel = interaction.member.voice.channel;
        if (!voiceChannel) {
            return interaction.reply({ content: 'You must be in a voice channel to use this command.' });
        }

        const permissions = voiceChannel.permissionsFor(interaction.client.user);
        if (!permissions.has('CONNECT') || !permissions.has('SPEAK')) {
            return interaction.reply({ content: 'I need permissions to join and speak in your voice channel!' });
        }

        // Si ya se está reproduciendo algo, añade la URL a la cola y notifica
        if (isPlaying) {
            playQueue.push(url);
            return interaction.reply({ content: `Added to queue: ${url}` });
        }

        // Si no se está reproduciendo, responde y comienza a reproducir
        isPlaying = true;
        if (!currentConnection) {
            currentConnection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: interaction.guild.id,
                adapterCreator: interaction.guild.voiceAdapterCreator,
            });
        }

        // Responde al interaction para evitar el error de InteractionNotReplied
        await interaction.reply({ content: `Now downloading and preparing the music for: ${url}` });
        playSong(url, interaction);
    },
});

function playSong(url, interaction) {
    const player = createAudioPlayer();
    currentConnection.subscribe(player);

    // Define la ruta temporal del archivo
    const tempFilePath = path.join(__dirname, 'temp_audio.mp3');

    // Descarga el audio usando yt-dlp (que internamente usa FFmpeg)
    const ffmpegProcess = exec(
        `"C:\\Users\\sevil\\Desktop\\Files\\bot\\yt-dlp.exe" -x --audio-format mp3 --quiet -o "${tempFilePath}" ${url}`,
        (error, stdout, stderr) => {
            if (error) {
                console.error(`exec error: ${error}`);
                interaction.followUp({ content: 'There was an error exporting the audio, please contact the owner' });
                isPlaying = false;
                playNextInQueue(interaction);
                return;
            }
            console.log('Descarga completa');
        }
    );

    // Cuando finaliza el proceso de descarga, reproduce el audio
    ffmpegProcess.on('close', (code) => {
        if (code !== 0) {
            interaction.followUp({ content: 'Error downloading the audio.' });
            isPlaying = false;
            playNextInQueue(interaction);
            return;
        }

        interaction.followUp({ content: `Now playing: ${url}` });

        // Crea el recurso de audio a partir del archivo descargado
        const resource = createAudioResource(tempFilePath, { inputType: 'mp3' });
        player.play(resource);

        player.on(AudioPlayerStatus.Playing, () => {
            console.log('Audio is now playing!');
        });

        player.on('error', (error) => {
            console.error('Error playing audio:', error);
            interaction.followUp({ content: 'There was an error playing the audio.' });
            isPlaying = false;
            playNextInQueue(interaction);
        });

        // Cuando el reproductor queda inactivo, limpia y reproduce la siguiente canción
        player.on(AudioPlayerStatus.Idle, () => {
            console.log('Playback finished. Cleaning up...');
            if (!ffmpegProcess.killed) {
                ffmpegProcess.kill();
            }
            fs.unlink(tempFilePath, (err) => {
                if (err) {
                    console.error('Error deleting temporary audio file:', err);
                } else {
                    console.log('Temporary audio file deleted.');
                }
                isPlaying = false;
                playNextInQueue(interaction);
            });
        });
    });
}

function playNextInQueue(interaction) {
    if (playQueue.length > 0) {
        const nextUrl = playQueue.shift();
        isPlaying = true;
        playSong(nextUrl, interaction);
    } else {
        // Si la cola está vacía, destruye la conexión de voz
        if (currentConnection) {
            currentConnection.destroy();
            currentConnection = null;
        }
    }
}



client.commands.set('stop', {
    data: {
        name: 'stop',
        description: 'Stops the music and leaves the voice channel',
    },
    execute: async (interaction) => {
        const connection = getVoiceConnection(interaction.guild.id);
        if (!connection) {
            return interaction.reply({ content: 'I am not currently in a voice channel!', ephemeral: true });
        }

        const tempFilePath = path.join(__dirname, 'temp_audio.mp3');

        // Kill the ffmpeg process if it is running
        exec('tasklist', (err, stdout, stderr) => {
            if (err) {
                console.error('Error listing processes:', err);
                return;
            }

            if (stdout.toLowerCase().includes('ffmpeg.exe')) {
                exec('taskkill /IM ffmpeg.exe /F', (killErr) => {
                    if (killErr) {
                        console.error('Error killing ffmpeg process:', killErr);
                    } else {
                        console.log('ffmpeg process killed successfully.');
                    }

                    // Now that ffmpeg is killed, delete the temporary audio file
                    fs.unlink(tempFilePath, (err) => {
                        if (err) {
                            console.error('Error deleting temporary audio file:', err);
                        } else {
                            console.log('Temporary audio file deleted.');
                        }
                    });
                });
            } else {
                console.log('No ffmpeg process found.');
                // If ffmpeg isn't running, directly delete the temporary audio file
                fs.unlink(tempFilePath, (err) => {
                    if (err) {
                        console.error('Error deleting temporary audio file:', err);
                    } else {
                        console.log('Temporary audio file deleted.');
                    }
                });
            }
        });

        // Stop the player and leave the voice channel
        connection.destroy();
        return interaction.reply({ content: 'Stopped the music and left the channel.', ephemeral: true });
    },
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



// Shared function to create a ticket channel
async function createTicketChannel(interaction) {
    if (!interaction.guild) {
        return interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
    }

    const categoryName = 'Tickets';
    const supportRoleName = 'Support';

    // Find or create the "Tickets" category
    let ticketCategory = interaction.guild.channels.cache.find(c => c.name === categoryName && c.type === 4);
    if (!ticketCategory) {
        try {
            ticketCategory = await interaction.guild.channels.create({
                name: categoryName,
                type: 4 // Category channel
            });
        } catch (error) {
            console.error('Error creating ticket category:', error);
            return interaction.reply({ content: 'There was an error creating the ticket category.', ephemeral: true });
        }
    }

    // Get the support role, if it exists
    const supportRole = interaction.guild.roles.cache.find(role => role.name === supportRoleName);

    const ticketChannelName = `ticket-${interaction.user.username}-${interaction.user.discriminator}`;
    try {
        // Build the permission overwrites array conditionally
        const permissionOverwrites = [
            {
                id: interaction.user.id,
                allow: [
                    PermissionsBitField.Flags.ViewChannel,
                    PermissionsBitField.Flags.SendMessages,
                    PermissionsBitField.Flags.ReadMessageHistory
                ]
            },
            {
                id: interaction.guild.id,
                deny: [PermissionsBitField.Flags.ViewChannel]
            }
        ];

        // Only add the support role if it exists
        if (supportRole) {
            permissionOverwrites.push({
                id: supportRole.id,
                allow: [
                    PermissionsBitField.Flags.ViewChannel,
                    PermissionsBitField.Flags.SendMessages,
                    PermissionsBitField.Flags.ReadMessageHistory
                ]
            });
        }

        const ticketChannel = await interaction.guild.channels.create({
            name: ticketChannelName,
            type: 0, // Text channel
            parent: ticketCategory.id,
            permissionOverwrites
        });

        await ticketChannel.send(
            `Hello ${interaction.user}, welcome to your support ticket. A member of our support team will be with you shortly.\nTo close this ticket, use the \`/close-ticket\` command.`
        );

        return interaction.reply({ content: `Your ticket has been created: ${ticketChannel}`, ephemeral: true });
    } catch (error) {
        console.error('Error creating ticket channel:', error);
        return interaction.reply({ content: 'There was an error creating your ticket channel.', ephemeral: true });
    }
}

// Slash command to create a ticket directly (optional)
client.commands.set('ticket', {
    data: {
        name: 'ticket',
        description: 'Creates a support ticket channel'
    },
    execute: async (interaction) => {
        await createTicketChannel(interaction);
    }
});

// Slash command to close a ticket (should be used in a ticket channel)
client.commands.set('close-ticket', {
    data: {
        name: 'close-ticket',
        description: 'Closes and deletes this ticket channel'
    },
    execute: async (interaction) => {
        // Ensure that this command is used inside a ticket channel
        if (!interaction.channel.name.startsWith('ticket-')) {
            return interaction.reply({ content: 'This command can only be used inside a ticket channel.', ephemeral: true });
        }
        await interaction.reply({ content: 'The ticket will close in 5 seconds...', ephemeral: true });
        setTimeout(() => {
            interaction.channel.delete().catch(err => {
                console.error('Error deleting ticket channel:', err);
            });
        }, 5000);
    }
});

// Slash command to send the Ticket Panel embed
client.commands.set('ticket-panel', {
    data: {
        name: 'ticket-panel',
        description: 'Sends a panel to open a support ticket'
    },
    execute: async (interaction) => {
        // Build the embed panel
        const embed = new EmbedBuilder()
            .setTitle('Support Ticket')
            .setDescription('If you need support, please click the **Open Ticket** button below. A member of our support team will be with you shortly.')
            .setColor(0x00AE86)
            .setFooter({ text: 'Ticket System' })
            .setTimestamp();

        // Create a button for opening a ticket
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('open_ticket')
                .setLabel('Open Ticket')
                .setStyle(ButtonStyle.Primary)
        );

        await interaction.reply({ embeds: [embed], components: [row] });
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
    // Handle slash commands first...
    if (interaction.isCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;
        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: 'There was an error executing this command!', ephemeral: true });
            }
        }
    }
    // Handle button interactions
    else if (interaction.isButton()) {
        if (interaction.customId === 'open_ticket') {
            try {
                await createTicketChannel(interaction);
            } catch (error) {
                console.error('Error in open_ticket button:', error);
                // If an error occurs, try to reply if not already replied
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ content: 'An unexpected error occurred while opening the ticket.', ephemeral: true });
                }
            }
        }
    }

    else if (interaction.customId === 'close_ticket') {
        const guild = interaction.guild;
        const ticketChannel = interaction.channel;
        const ticketInfo = {
            user: interaction.user.tag,
            reason: "Reason",
        };

        await logTicketToAuditChannel(guild, ticketInfo);
        
        // Eliminar el canal del ticket
        await ticketChannel.delete();
    }
});

client.login(TOKEN);