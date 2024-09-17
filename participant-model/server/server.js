/* eslint-disable import/no-unresolved */
import { Meteor } from 'meteor/meteor';
import { User } from 'meteor/socialize:user-model';
import { UserPresence } from 'meteor/socialize:user-presence';

/* eslint-enable import/no-unresolved */

import { ParticipantsCollection, ConversationsCollection } from '../../common.js';

ParticipantsCollection.allow({
    insert(userId, participant) {
        const user = User.createEmpty(userId);
        const addedUser = User.createEmpty(participant.userId);

        if (!userId) {
            throw new Meteor.Error('Must Login', 'User must be logged in to perform this action');
        }

        // only allow participant to be added on client if the currentUser is already
        // participating and the added user is not currently participating in the conversation
        if (user.isParticipatingIn(participant.conversationId)) {
            if (addedUser.isParticipatingIn(participant.conversationId)) {
                throw new Meteor.Error('Already Participating', `${addedUser._id} is already participating in in this conversation`);
            } else {
                return true;
            }
        } else {
            throw new Meteor.Error('Must Be Participating', `${user._id} is not participating in this conversation, so therefore cannot add users to it.`);
        }
    },
    update(userId, participant) {
        // can be updated if the record belongs to the currentUser
        return participant.checkOwnership();
    },
});

ParticipantsCollection.after.insert(function afterinsert(userId, document) {
    ConversationsCollection.updateAsync(document.conversationId, { $addToSet: { _participants: document.userId } });
});

ParticipantsCollection.after.update(function afterUpdate(userId, document) {
    if (document.deleted) {
        if (this.transform().conversation().isReadOnly()) {
            ConversationsCollection.removeAsync(document.conversationId);
        } else {
            ConversationsCollection.updateAsync(document.conversationId, { $pull: { _participants: document.userId } });
        }
    }
});


UserPresence.onCleanup(function onCleanup(sessionIds) {
    if (sessionIds) {
        ParticipantsCollection.updateAsync({ observing: { $in: sessionIds } }, { $pullAll: { observing: sessionIds } }, { multi: true });
    } else {
        ParticipantsCollection.updateAsync({}, { $set: { observing: [] } }, { multi: true });
    }
});
