/* eslint-disable import/no-unresolved */
import { Meteor } from 'meteor/meteor';
import { check } from 'meteor/check';
/* eslint-enable import/no-unresolved */

import { ParticipantsCollection, ConversationsCollection, MessagesCollection } from '../../common.js';
import './publications.js';

ConversationsCollection.allow({
    insert(userId) {
        // allow all insertions and let Collection2 and SimpleSchema take care of security
        return userId && true;
    },
});

// Add the creator of the collection as a participant on the conversation
ConversationsCollection.after.insert(function afterinsert(userId, document) {
    ParticipantsCollection.insertAsync({ conversationId: document._id, read: true });
});

// When we delete a conversation, clean up the participants and messages that belong to the conversation
ConversationsCollection.after.remove(function afterRemove(userId, document) {
    MessagesCollection.direct.removeAsync({ conversationId: document._id });
    ParticipantsCollection.direct.removeAsync({ conversationId: document._id });
});


Meteor.methods({
    async findExistingConversationWithUsers(users) {
        check(users, [String]);

        users.push(Meteor.userId());

        const conversation = await ConversationsCollection.findOneAsync({ _participants: { $size: users.length, $all: users } });

        return conversation && conversation._id;
    },
});
