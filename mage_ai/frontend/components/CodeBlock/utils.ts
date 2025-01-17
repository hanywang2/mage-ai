import BlockType, {
  BLOCK_TYPE_NAME_MAPPING,
  BlockRequestPayloadType,
  BlockTypeEnum,
  CONVERTIBLE_BLOCK_TYPES,
} from '@interfaces/BlockType';
import PipelineType from '@interfaces/PipelineType';
import { FlyoutMenuItemType } from '@oracle/components/FlyoutMenu';
import { lowercase } from '@utils/string';

export const getUpstreamBlockUuids = (
  currentBlock: BlockType,
  newBlock?: BlockRequestPayloadType,
): string[] => {
  const upstreamBlocks = newBlock?.upstream_blocks || [];

  if (BlockTypeEnum.CHART !== currentBlock.type
    && BlockTypeEnum.SCRATCHPAD !== currentBlock.type
    && BlockTypeEnum.CHART !== newBlock?.type
    && BlockTypeEnum.SCRATCHPAD !== newBlock?.type
    && (
      BlockTypeEnum.DATA_LOADER !== newBlock?.type
        || BlockTypeEnum.SENSOR === currentBlock.type
    )
  ) {
    upstreamBlocks.push(currentBlock.uuid);
  }

  return upstreamBlocks;
};

export const buildConvertBlockMenuItems = (
  b: BlockType,
  blocks: BlockType[],
  baseUUID: string,
  addNewBlock: (block: BlockRequestPayloadType) => Promise<any>,
): FlyoutMenuItemType[] => {
  const upstreamBlocks = [];
  let currentIndex = blocks.findIndex(({ uuid }) => uuid === b.uuid);

  let previousBlock;
  while (!previousBlock && currentIndex >= 0) {
    previousBlock = blocks[currentIndex - 1];
    if (BlockTypeEnum.SCRATCHPAD === previousBlock?.type) {
      previousBlock = null;
    }
    currentIndex -= 1;
  }

  if (previousBlock) {
    upstreamBlocks.push(previousBlock.uuid);
  }

  return (
    CONVERTIBLE_BLOCK_TYPES.map(blockType => ({
      label: () => `Convert to ${lowercase(BLOCK_TYPE_NAME_MAPPING[blockType])}`,
      // @ts-ignore
      onClick: () => addNewBlock({
        converted_from_type: blockType,
        converted_from_uuid: b.uuid,
        type: blockType,
        upstream_blocks: upstreamBlocks,
      }),
      uuid: `${baseUUID}/convert_to/${blockType}`,
    }))
  );
};

export const getMoreActionsItems = (
  block: BlockType,
  runBlock: (payload: {
    block: BlockType;
    runSettings?: {
      build_model?: boolean;
      run_model?: boolean;
      test_model?: boolean;
    };
    runTests?: boolean;
    runUpstream?: boolean;
  }) => void,
  deleteBlock: (block: BlockType) => void,
  setOutputCollapsed: (outputCollapsed: boolean) => void,
  isStreamingPipeline: boolean,
  opts?: {
    blocksMapping: {
      [uuid: string]: BlockType;
    };
    fetchFileTree: () => void;
    fetchPipeline: () => void;
    savePipelineContent: (payload?: {
      block?: BlockType;
      pipeline?: PipelineType;
    }) => Promise<any>;
    updatePipeline: (payload: {
      pipeline: {
        add_upstream_for_block_uuid: string;
      };
    }) => Promise<any>;
  },
): FlyoutMenuItemType[] => {
  const {
    configuration,
    downstream_blocks: downstreamBlocks,
    has_callback,
    upstream_blocks: upstreamBlocks,
  } = block || {};
  const {
    dynamic,
    reduce_output: reduceOutput,
  } = configuration || {};
  const isDBT = BlockTypeEnum.DBT === block?.type;

  const items: FlyoutMenuItemType[] = [];

  if (BlockTypeEnum.EXTENSION === block.type) {
  } else {
    items.push({
      label: () => isDBT
        ? 'Execute and run upstream blocks'
        : 'Execute with upstream blocks',
      onClick: () => runBlock({ block, runUpstream: true }),
      uuid: 'execute_upstream',
    });

    if (!isDBT) {
      items.push({
        label: () => 'Execute block and run tests',
        onClick: () => runBlock({ block, runTests: true }),
        uuid: 'run_tests',
      });
    }

    const {
      blocksMapping,
      fetchFileTree,
      fetchPipeline,
      savePipelineContent,
      updatePipeline,
    } = opts || {};

    // If current block’s downstream has other dynamic blocks,
    // disable this button
    const otherDynamicBlocks = [];
    downstreamBlocks.forEach((uuid1: string) => {
      const b = blocksMapping?.[uuid1];
      if (b) {
        b.upstream_blocks.forEach((uuid2: string) => {
          if (blocksMapping?.[uuid2]?.configuration?.dynamic) {
            otherDynamicBlocks.push(blocksMapping[uuid2]);
          }
        });
      }
    });

    if (isDBT) {
      items.unshift(...[
        {
          label: () => 'Run model',
          onClick: () => runBlock({
            block,
            runSettings: {
              run_model: true,
            },
          }),
          tooltip: () => 'Execute command dbt run.',
          uuid: 'run_model',
        },
        {
          label: () => 'Test model',
          onClick: () => runBlock({
            block,
            runSettings: {
              test_model: true,
            },
          }),
          tooltip: () => 'Execute command dbt test.',
          uuid: 'test_model',
        },
        {
          label: () => 'Build model',
          onClick: () => runBlock({
            block,
            runSettings: {
              build_model: true,
            },
          }),
          tooltip: () => 'Execute command dbt build.',
          uuid: 'build_model',
        },
        {
          label: () => 'Add upstream models',
          onClick: () => {
            updatePipeline({
              pipeline: {
                add_upstream_for_block_uuid: block?.uuid,
              },
            });
          },
          tooltip: () => 'Add upstream models for this model to the pipeline.',
          uuid: 'add_upstream_models',
        },
      ]);
    }

    if (!isDBT && savePipelineContent && (dynamic || otherDynamicBlocks.length === 0)) {
      items.push({
        label: () => dynamic ? 'Disable block as dynamic' : 'Set block as dynamic',
        onClick: () => savePipelineContent({
          block: {
            ...block,
            configuration: {
              ...configuration,
              dynamic: !dynamic,
            },
          },
        }),
        uuid: 'dynamic',
      });
    }

    if (blocksMapping) {
      const dynamicChildBlock = upstreamBlocks?.find(
        (uuid: string) => blocksMapping?.[uuid]?.configuration?.dynamic,
      );

      if (dynamicChildBlock) {
        items.push({
          label: () => reduceOutput ? 'Don’t reduce output' : 'Reduce output',
          onClick: () => savePipelineContent({
            block: {
              ...block,
              configuration: {
                ...configuration,
                reduce_output: !reduceOutput,
              },
            },
          }),
          uuid: 'reduce_output',
        });
      }
    }

    items.push({
      label: () => has_callback ? 'Remove callback' : 'Add callback',
      onClick: () => savePipelineContent({
        block: {
          ...block,
          has_callback: !has_callback,
        },
      }).then(() => {
        fetchFileTree();
        fetchPipeline();
      }),
      uuid: 'has_callback',
    });
  }

  items.push({
    label: () => 'Delete block',
    onClick: () => {
      deleteBlock(block);
      setOutputCollapsed(false);
    },
    uuid: 'delete_block',
  });

  if (isStreamingPipeline) {
    return [items.pop()];
  }

  return items;
};

export function buildBorderProps({
  block,
  dynamic,
  dynamicUpstreamBlock,
  hasError,
  reduceOutput,
  reduceOutputUpstreamBlock,
  selected,
}) {
  const arr = [];

  if (dynamic) {
    arr.push({
      title: 'Dynamic',
      description: 'This block will create N blocks for each of its downstream blocks.',
    });
  }

  const dynamicChildBlock = dynamicUpstreamBlock && !reduceOutputUpstreamBlock;
  if (dynamicChildBlock) {
    arr.push({
      title: 'Dynamic child',
      description: 'This block is dynamically created by its upstream parent block that is dynamic.',
    });

    if (reduceOutput) {
      arr.push({
        title: 'Reduce output',
        description: 'Reduce output from all dynamically created blocks into a single array output.',
      });
    }
  }

  return {
    borderColorShareProps: {
      blockColor: block?.color,
      blockType: block?.type,
      dynamicBlock: dynamic,
      dynamicChildBlock,
      hasError,
      selected,
    },
    tags: arr,
  };
}
