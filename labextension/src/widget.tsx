/*
 * Copyright 2019-2020 The Kale Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin,
  ILabShell,
  ILayoutRestorer
} from '@jupyterlab/application';

import { INotebookTracker } from '@jupyterlab/notebook';

import { IDocumentManager } from '@jupyterlab/docmanager';

import { ReactWidget } from '@jupyterlab/apputils';

import { Token } from '@lumino/coreutils';
import { Widget } from '@lumino/widgets';
import * as React from 'react';

import '../style/index.css';

import { KubeflowKaleLeftPanel } from './widgets/LeftPanel';
import NotebookUtils from './lib/NotebookUtils';
import { executeRpc, globalUnhandledRejection } from './lib/RPCUtils';
import { Kernel } from '@jupyterlab/services';
import { PageConfig } from '@jupyterlab/coreutils';
import { LabIcon } from '@jupyterlab/ui-components';

/* tslint:disable */
export const IKubeflowKale = new Token<IKubeflowKale>(
  'kubeflow-kale-labextension:IKubeflowKale'
);

export interface IKubeflowKale {
  widget: Widget;
}

const id = 'kubeflow-kale-labextension:deploymentPanel';

const KALE_LOGO_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
  <path fill="#753bbd" d="M25.37 14.35a14.94 14.94 0 0110.7-6c0-.08-.08-.16-.14-.23a5 5 0 00-1.66-1.35 3.79 3.79 0 01-.54-.35 3.29 3.29 0 01-.32-.64 4.7 4.7 0 00-1.08-1.72 5.22 5.22 0 00-2-1 4.1 4.1 0 01-.56-.22 3.5 3.5 0 01-.53-.62A4.49 4.49 0 0027.81.81 4.48 4.48 0 0025.65.3a1.42 1.42 0 00-.28 0zM22.37.34a1.29 1.29 0 00-.28 0 4.48 4.48 0 00-2.16.52 4.49 4.49 0 00-1.47 1.42 3.51 3.51 0 01-.53.62 4.1 4.1 0 01-.56.22 5.22 5.22 0 00-2 1 4.69 4.69 0 00-1.08 1.72 3.3 3.3 0 01-.32.64 3.79 3.79 0 01-.54.35 5 5 0 00-1.66 1.35 4.67 4.67 0 00-.73 1.92 3.36 3.36 0 01-.18.67 3.61 3.61 0 01-.46.46 4.83 4.83 0 00-1.3 1.64 4.6 4.6 0 00-.29 2.06 3.33 3.33 0 010 .68 3.54 3.54 0 01-.34.55 4.7 4.7 0 00-.9 1.95 4.56 4.56 0 00.25 2.08 4 4 0 01.16.63c0 .09-.11.26-.17.38a3.72 3.72 0 00-.48 1.8A3.88 3.88 0 008 24.85l.16.27c0 .1-.07.25-.1.35a3.67 3.67 0 00-.18 1.87 3.88 3.88 0 001 1.75l.2.24v.38a3.62 3.62 0 00.23 1.9 3.91 3.91 0 001.4 1.52l.26.19c0 .1.06.26.08.38a3.64 3.64 0 00.74 1.8 4 4 0 001.79 1.11l.31.12c.06.09.14.24.19.36a3.72 3.72 0 001.21 1.52 6.55 6.55 0 002.34.64 11.24 11.24 0 013.74 8.39h1zM39.58 25.12l.16-.27A3.88 3.88 0 0040.4 23a3.73 3.73 0 00-.47-1.79 3.8 3.8 0 01-.17-.38 4.06 4.06 0 01.16-.63 4.56 4.56 0 00.25-2.08 4.69 4.69 0 00-.9-1.95 3.56 3.56 0 01-.34-.55 3.34 3.34 0 010-.68 4.6 4.6 0 00-.29-2.06 4.52 4.52 0 00-1.22-1.55h-.09a12 12 0 00-11.94 11.59A14.89 14.89 0 0137.27 33a3.57 3.57 0 001.2-1.37 3.62 3.62 0 00.23-1.9v-.38l.2-.24a3.89 3.89 0 001-1.75 3.66 3.66 0 00-.18-1.87c-.07-.12-.12-.27-.14-.37zM25.37 26v21.63h1a11.19 11.19 0 013.81-8.39 6.55 6.55 0 002.34-.64 3.71 3.71 0 001.21-1.52c.06-.11.14-.27.19-.36l.31-.12a7 7 0 00.81-.34C34.26 31 30.1 26.73 25.37 26z"/>
</svg>
`;

const kaleIcon = new LabIcon({ name: 'kale:logo', svgstr: KALE_LOGO_SVG });

/**
 * Adds a visual Kubeflow Pipelines Deployment tool to the sidebar.
 */
export default {
  activate,
  id,
  requires: [ILabShell, ILayoutRestorer, INotebookTracker, IDocumentManager],
  provides: IKubeflowKale,
  autoStart: true
} as JupyterFrontEndPlugin<IKubeflowKale>;

async function activate(
  lab: JupyterFrontEnd,
  labShell: ILabShell,
  restorer: ILayoutRestorer,
  tracker: INotebookTracker,
  docManager: IDocumentManager
): Promise<IKubeflowKale> {
  let widget: ReactWidget | undefined;
  const kernel: Kernel.IKernelConnection =
    await NotebookUtils.createNewKernel();
  window.addEventListener('beforeunload', () => kernel.shutdown());
  window.addEventListener('unhandledrejection', globalUnhandledRejection);

  /**
   * Detect if Kale is installed
   */
  async function getBackend(kernel: Kernel.IKernelConnection) {
    try {
      await NotebookUtils.sendKernelRequest(kernel, 'import kale', {});
    } catch (error) {
      console.error(`Kale backend is not installed: ${error}`);

      return false;
    }
    return true;
  }

  // TODO: backend can become an Enum that indicates the type of
  //  env we are in (like Local Laptop, MiniKF, GCP, UI without Kale, ...)
  const backend = await getBackend(kernel);
  // let rokError: IRPCError = null;
  if (backend) {
    try {
      await executeRpc(kernel, 'log.setup_logging');
    } catch (error) {
      globalUnhandledRejection({ reason: error });
      throw error;
    }
  }

  async function loadPanel() {
    let reveal_widget = undefined;
    if (backend) {
      // Check if KALE_NOTEBOOK_PATH env variable exists and if so load
      // that Notebook
      const path = await executeRpc(kernel, 'nb.resume_notebook_path', {
        server_root: PageConfig.getOption('serverRoot')
      });
      if (path) {
        console.log('Resuming notebook ' + path);
        // open the notebook panel
        reveal_widget = docManager.openOrReveal(path);
      }
    }

    // add widget
    if (widget && !widget.isAttached) {
      labShell.add(widget, 'left');
    }
    // open widget if resuming from a notebook
    if (reveal_widget && widget) {
      // open kale panel
      widget.activate();
    }
  }

  // Creates the left side bar widget once the app has fully started
  lab.started.then(() => {
    // show list of commands in the commandRegistry
    // console.log(lab.commands.listCommands());
    widget = ReactWidget.create(
      <KubeflowKaleLeftPanel
        lab={lab}
        tracker={tracker}
        docManager={docManager}
        backend={backend}
        kernel={kernel}
      />
    );
    widget.id = 'kubeflow-kale-labextension/kubeflowDeployment';
    widget.title.icon = kaleIcon;
    widget.title.caption = 'Kubeflow Pipelines Deployment Panel';
    widget.node.classList.add('kale-panel');

    restorer.add(widget, widget.id);
  });

  // Initialize once the application shell has been restored
  // and all the widgets have been added to the NotebookTracker
  lab.restored.then(() => {
    loadPanel();
  });

  return {
    get widget() {
      if (!widget) {
        throw new Error('Widget not initialized yet');
      }
      return widget;
    }
  };
}
