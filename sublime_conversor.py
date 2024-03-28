import json
import xml.etree.ElementTree as ET
from xml.dom.minidom import parseString

def convert_json_to_xml(json_obj):
    array_element = ET.Element('array')

    for item in json_obj:
        dict_element = ET.SubElement(array_element, 'dict')

        for key, value in item.items():
            key_element = ET.SubElement(dict_element, 'key')
            key_element.text = key

            string_element = ET.SubElement(dict_element, 'string')
            string_element.text = value

    return ET.tostring(array_element, encoding='unicode')

def prettify(xml_str):
    dom = parseString(xml_str)
    return dom.toprettyxml(indent='    ')[23:]  # remove xml declaration

# Load the JSON file
with open('lui.tmLanguage.json', 'r') as f:
    data = json.load(f)

json_obj = data['patterns']

xml_str = convert_json_to_xml(json_obj)
pretty_xml_str = prettify(xml_str)

# Create the complete .tmLanguage file
tmLanguage = f'''<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>name</key>
    <string>LUI</string>
    <key>scopeName</key>
    <string>source.lui</string>
    <key>patterns</key>
{pretty_xml_str}
</dict>
</plist>'''

print(tmLanguage)

# Save the .tmLanguage file
with open('sublimeLui.tmLanguage', 'w') as f:
    f.write(tmLanguage)