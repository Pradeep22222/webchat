require("dotenv").config();

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const User = require("../models/User");

async function createUsers() {

    try {

        await mongoose.connect(process.env.MONGO_URI);

        const users = [

            {
                username: "Sami",
                password: "IamSami@123",
                displayName: "Sami",
                role: "userA"
            },

            {
                username: "PK",
                password: "IamPK@787898",
                displayName: "User B",
                role: "userB"
            }

        ];

        for (const account of users) {

            const existing = await User.findOne({
                username: account.username
            });

            if (existing) {
                console.log(
                    `${account.username} already exists`
                );
                continue;
            }

            const hashedPassword = await bcrypt.hash(
                account.password,
                12
            );

            await User.create({

                username: account.username,

                password: hashedPassword,

                displayName: account.displayName,

                role: account.role

            });

            console.log(
                `${account.username} created successfully`
            );

        }

    } catch (error) {

        console.error(error);

    } finally {

        await mongoose.disconnect();

    }

}

createUsers();