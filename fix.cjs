const fs = require('fs');
let code = fs.readFileSync('src/frontend/components/ChatBot.jsx', 'utf8');

const replacement = `                            buttonTheme={[
                                {
                                    class: "hg-wide-key",
                                    buttons: "{shift} {bksp} {numbers} {default} {enter} {global}"
                                },
                                {
                                    class: "hg-space-key",
                                    buttons: "{space}"
                                }
                            ]}
                            physicalKeyboardHighlight={true}
                        />
                    </div>
                </div>
            )}
        </>
    );
});

ChatBot.displayName = 'ChatBot';

export default ChatBot;
`;

// Find where buttonTheme begins and replace everything after it
const regex = /buttonTheme=\{\[[\s\S]*$/;
if (regex.test(code)) {
    fs.writeFileSync('src/frontend/components/ChatBot.jsx', code.replace(regex, replacement));
    console.log('Fixed');
} else {
    console.log('Regex not found');
}
