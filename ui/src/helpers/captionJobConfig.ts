import { CaptionJobConfig } from "@/types";
import { captionerTypes } from "./captionOptions";


export const defaultCaptionJobConfig: CaptionJobConfig = {
  job: 'extension',
  config: {
    name: 'Caption Directory',
    process: [
      {
        type: 'Qwen3VLCaptioner',
        sqlite_db_path: './aitk_db.db',
        device: 'cuda',
        caption: {
          model_name_or_path: 'Qwen/Qwen3-VL-8B-Instruct',
          dtype: 'bf16',
          // 8B bf16 fits comfortably on 32 GB Blackwell (~16 GB weights + pipeline)
          // and avoids the fp8-quantization accuracy loss on detailed captions.
          quantize: false,
          qtype: 'float8',
          low_vram: false,
          extensions: ['jpg', 'jpeg', 'png', 'bmp', 'webp'],
          path_to_caption: '',
          recaption: false,
          caption_prompt: 'Caption this image as if you were going to try to generate it with an image generator. Be thurough and describe everything in the image. Be decisive by stating things as they are. Do not say things like "It appears that" Or "possibly". Start out with things like "A person on the beach" or "A black dragon". No preamble. Just get to the point.',
          max_res: 1024,
          max_new_tokens: 256,
        },
      },
    ],
  },
};


const repairDefaults = (defaults: { [key: string]: any }) => {
  let newDefaults: { [key: string]: any } = {};
  // if the key doesnt start with config.process[0]., then add it
  for (const key in defaults) {
    if (!key.startsWith('config.process[0].')) {
      newDefaults[`config.process[0].${key}`] = defaults[key];
    } else {
      newDefaults[key] = defaults[key];
    }
  }
  return newDefaults;
}



export const handleCaptionerTypeChange = (
  currentTypeName: string,
  newTypeName: string,
  jobConfig: CaptionJobConfig,
  setJobConfig: (value: any, key: string) => void,
) => {
  const currentType = captionerTypes.find(a => a.name === currentTypeName);
  if (!currentType || currentType.name === newTypeName) {
    return;
  }

  // update the defaults when a model is selected
  const newType = captionerTypes.find(model => model.name === newTypeName);

  let currentDefaults = repairDefaults(currentType.defaults || {});
  let newDefaults = repairDefaults(newType?.defaults || {});

  // set new model
  setJobConfig(newTypeName, 'config.process[0].type');

  // revert defaults from previous model
  for (const key in currentDefaults) {
    setJobConfig(currentDefaults[key][1], key);
  }

  for (const key in newDefaults) {
    setJobConfig(newDefaults[key][0], key);
  }
};
