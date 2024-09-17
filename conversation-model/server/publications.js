/* eslint-disable import/no-unresolved */
import { Meteor } from 'meteor/meteor';
import { check, Match } from 'meteor/check';
import { User } from 'meteor/socialize:user-model';
import { publishComposite } from 'meteor/reywood:publish-composite';

import { ParticipantsCollection, Conversation, ConversationsCollection } from '../../common.js';

let SyntheticMutator;

if (ParticipantsCollection.configureRedisOplog) {
    SyntheticMutator = require('meteor/cultofcoders:redis-oplog').SyntheticMutator; // eslint-disable-line
}


const optionsArgumentCheck = {
    limit: Match.Optional(Number),
    skip: Match.Optional(Number),
    sort: Match.Optional(Object),
};

publishComposite('socialize.conversation', function publishConversation(conversationId) {
    check(conversationId, String);

    if (this.userId) {
        const user = User.createEmpty(this.userId);
        if (user.isParticipatingIn(conversationId)) {
            return {
                find() {
                    return ConversationsCollection.find({ _id: conversationId }, { limit: 1 });
                },
                children: [
                    {
                        find(conversation) {
                            return conversation.participants();
                        },
                        children: [{
                            find(participant) {
                                return Meteor.users.find({ _id: participant.userId }, { fields: User.fieldsToPublish });
                            },
                        }],
                    },
                    {
                        find(conversation) {
                            return conversation.messages({ limit: 1, sort: { createdAt: -1 } });
                        },
                    },
                ],
            };
        }
    }
    return this.ready();
});

publishComposite('socialize.conversations', function publishConversations(options = { limit: 10, sort: { updatedAt: -1 } }) {
    check(options, optionsArgumentCheck);
    if (!this.userId) {
        return this.ready();
    }

    return {
        find() {
            return ParticipantsCollection.find({ userId: this.userId, deleted: { $exists: false } }, options);
        },
        children: [
            {
                find(participant) {
                    return ConversationsCollection.find({ _id: participant.conversationId });
                },
                children: [
                    {
                        find(conversation) {
                            return conversation.participants();
                        },
                        children: [
                            {
                                find(participant) {
                                    return Meteor.users.find({ _id: participant.userId }, { fields: User.fieldsToPublish });
                                },
                            },
                        ],
                    },
                    {
                        find(conversation) {
                            return conversation.messages({ limit: 1, sort: { createdAt: -1 } });
                        },
                    },
                ],
            },
        ],
    };
});


publishComposite('socialize.unreadConversations', function publishUnreadConversations() {
    if (!this.userId) {
        return this.ready();
    }

    return {
        find() {
            return ParticipantsCollection.find({ userId: this.userId, deleted: { $exists: false }, read: false });
        },
        children: [
            {
                find(participant) {
                    return ConversationsCollection.find({ _id: participant.conversationId });
                },
                children: [
                    {
                        find(conversation) {
                            return conversation.participants();
                        },
                        children: [
                            {
                                find(participant) {
                                    return Meteor.users.find({ _id: participant.userId }, { fields: User.fieldsToPublish });
                                },
                            },
                        ],
                    },
                    {
                        find(conversation) {
                            return conversation.messages({ limit: 1, sort: { createdAt: -1 } });
                        },
                    },
                ],
            },
        ],
    };
});


Meteor.publish('socialize.messagesFor', function publishMessageFor(conversationId, options = { limit: 30, sort: { createdAt: -1 } }) {
    check(conversationId, String);
    check(options, optionsArgumentCheck);
    if (this.userId) {
        const user = User.createEmpty(this.userId);
        const conversation = Conversation.createEmpty(conversationId);
        if (user.isParticipatingIn(conversationId)) {
            return conversation.messages(options);
        }
    }
    return this.ready();
});


/**
 * This publication when subscribed to, updates the state of the participant
 * to keep track of the last message read by the user and whether they are viewing
 * it at this current moment. When the publication stops it updates the participant
 * to indicate they are no longer viewing the conversation
 *
 * @param   {String}    conversationId The _id of the conversation the user is viewing
 */
Meteor.publish('socialize.viewingConversation', function viewingConversationPublication(conversationId) {
    check(conversationId, String);

    if (this.userId) {
        const user = User.createEmpty(this.userId);

        if (user.isParticipatingIn(conversationId)) {
            const sessionId = this._session.id;


            ParticipantsCollection.updateAsync({
                conversationId, userId: this.userId,
            }, {
                $addToSet: { observing: sessionId },
                $set: { read: true },
            });

            this.onStop(() => {
                ParticipantsCollection.updateAsync({
                    conversationId, userId: this.userId,
                }, {
                    $pull: { observing: sessionId },
                });
            });
        }
    }


    this.ready();
});


/**
 * This publication when subscribed to sets the typing state of a participant in a conversation to true. When stopped it sets it to false.
 * @param   {String}   conversationId The _id of the participant
 */
Meteor.publish('socialize.typing', async function typingPublication(conversationId) {
    check(conversationId, String);

    if (this.userId) {
        const user = User.createEmpty(this.userId);

        if (user.isParticipatingIn(conversationId)) {
            const participant = await ParticipantsCollection.findOneAsync({ conversationId, userId: this.userId }, { fields: { _id: 1 } });

            const sessionId = this._session.id;

            const typingModifier = {
                $addToSet: { typing: sessionId },
            };

            const notTypingModifier = {
                $pull: { typing: sessionId },
            };

            const collectionName = participant.getCollectionName();

            if (SyntheticMutator) {
                SyntheticMutator.updateAsync(`conversations::${conversationId}::${collectionName}`, participant._id, typingModifier);

                this.onStop(() => {
                    SyntheticMutator.updateAsync(`conversations::${conversationId}::${collectionName}`, participant._id, notTypingModifier);
                });
            } else {
                participant.updateAsync(typingModifier);

                this.onStop(() => {
                    participant.updateAsync(notTypingModifier);
                });
            }
        }
    }

    this.ready();
});
